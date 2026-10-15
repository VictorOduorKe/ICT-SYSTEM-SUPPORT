import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getPool } from '../../db/pool.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import {
  createTicketDraft,
  getActiveDraftForUser,
  autosaveTicketDraft,
  submitTicket,
  checkDuplicateTickets,
  transitionTicketStatus,
  addTicketNote,
  getTicketById,
} from './ticket.service.js';

export const ticketRouter = Router();

const draftPayloadSchema = z.object({
  client_version: z.number().int().positive(),
  title: z.string().max(255).optional(),
  description: z.string().optional(),
  category: z
    .enum(['hardware', 'network', 'printer', 'software', 'access', 'security', 'maintenance', 'other'])
    .optional(),
  priority: z.enum(['low', 'normal', 'high', 'critical']).optional(),
  department_id: z.number().int().positive().nullable().optional(),
  asset_id: z.number().int().positive().nullable().optional(),
  affected_person_id: z.number().int().positive().nullable().optional(),
});

const submitPayloadSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(255),
  description: z.string().min(5, 'Description must be at least 5 characters'),
  category: z.enum(['hardware', 'network', 'printer', 'software', 'access', 'security', 'maintenance', 'other']),
  priority: z.enum(['low', 'normal', 'high', 'critical']).default('normal'),
  department_id: z.number().int().positive('Please select a valid department'),
  asset_id: z.number().int().positive().nullable().optional(),
  affected_person_id: z.number().int().positive().nullable().optional(),
  idempotency_key: z.string().max(64).nullable().optional(),
});

const transitionPayloadSchema = z.object({
  target_status: z.enum(['pending', 'in_progress', 'resolved', 'cancelled']),
  note: z.string().min(3, 'Operational note must be at least 3 characters').max(1000),
  resolution_summary: z.string().max(2000).nullable().optional(),
});

const notePayloadSchema = z.object({
  note: z.string().min(2, 'Note must be at least 2 characters').max(2000),
});

const searchTicketsSchema = z.object({
  search: z.string().optional(),
  status: z.enum(['all', 'pending', 'in_progress', 'resolved', 'cancelled']).optional().default('all'),
  category: z
    .enum(['all', 'hardware', 'network', 'printer', 'software', 'access', 'security', 'maintenance', 'other'])
    .optional()
    .default('all'),
  priority: z.enum(['all', 'low', 'normal', 'high', 'critical']).optional().default('all'),
  department_id: z.coerce.number().int().positive().optional(),
  asset_id: z.coerce.number().int().positive().optional(),
  officer_id: z.coerce.number().int().positive().optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  is_draft: z.enum(['true', 'false', 'all']).optional().default('false'),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  sortBy: z.enum(['created_at', 'updated_at', 'priority', 'status', 'ticket_number']).optional().default('created_at'),
  sortOrder: z.enum(['ASC', 'DESC', 'asc', 'desc']).optional().default('DESC'),
});

// 1. GET /api/v1/tickets/drafts/active - Check for active unsubmitted draft
ticketRouter.get('/drafts/active', requireRole(['ict_officer', 'administrator']), async (req: Request, res: Response) => {
  try {
    const draft = await getActiveDraftForUser(req.user!.id);
    res.json({
      success: true,
      data: draft,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: 'DRAFT_FETCH_ERROR', message: err.message },
    });
  }
});

// 2. POST /api/v1/tickets/drafts - Create or recover a draft
ticketRouter.post('/drafts', requireRole(['ict_officer', 'administrator']), async (req: Request, res: Response) => {
  try {
    const draft = await createTicketDraft(req.user!.id);
    res.status(201).json({
      success: true,
      data: draft,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: 'DRAFT_CREATE_ERROR', message: err.message },
    });
  }
});

// 3. PATCH /api/v1/tickets/:id/draft - Debounced autosave with optimistic concurrency check
ticketRouter.patch('/:id/draft', requireRole(['ict_officer', 'administrator']), async (req: Request, res: Response) => {
  const ticketId = parseInt(req.params.id, 10);
  if (isNaN(ticketId)) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_ID', message: 'Invalid ticket draft ID' },
    });
  }

  const parseResult = draftPayloadSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid draft autosave payload',
        details: parseResult.error.format(),
      },
    });
  }

  const { client_version, ...draftFields } = parseResult.data;

  try {
    const result = await autosaveTicketDraft(ticketId, client_version, draftFields, req.user!.id);
    res.json({
      success: true,
      data: result,
    });
  } catch (err: any) {
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      error: {
        code: err.code || 'AUTOSAVE_ERROR',
        message: err.message,
        currentDraft: err.currentDraft || null,
      },
    });
  }
});

// 4. POST /api/v1/tickets/:id/submit - Validate & officially submit an existing draft
ticketRouter.post('/:id/submit', requireRole(['ict_officer', 'administrator']), async (req: Request, res: Response) => {
  const draftId = parseInt(req.params.id, 10);
  if (isNaN(draftId)) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_ID', message: 'Invalid ticket draft ID' },
    });
  }

  const parseResult = submitPayloadSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Please complete all required fields before submitting the ticket',
        details: parseResult.error.format(),
      },
    });
  }

  try {
    const submittedTicket = await submitTicket(draftId, parseResult.data, req.user!.id, req.ip);
    res.status(201).json({
      success: true,
      data: submittedTicket,
    });
  } catch (err: any) {
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      error: { code: err.code || 'SUBMISSION_ERROR', message: err.message },
    });
  }
});

// 5. POST /api/v1/tickets - Direct single-shot ticket submission
ticketRouter.post('/', requireRole(['ict_officer', 'administrator']), async (req: Request, res: Response) => {
  const parseResult = submitPayloadSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Please complete all required fields',
        details: parseResult.error.format(),
      },
    });
  }

  try {
    const ticket = await submitTicket(null, parseResult.data, req.user!.id, req.ip);
    res.status(201).json({
      success: true,
      data: ticket,
    });
  } catch (err: any) {
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      error: { code: err.code || 'TICKET_CREATE_ERROR', message: err.message },
    });
  }
});

// 6. GET /api/v1/tickets/check-duplicates - Check for duplicate open tickets on asset/user
ticketRouter.get('/check-duplicates', requireAuth, async (req: Request, res: Response) => {
  const asset_id = req.query.asset_id ? parseInt(req.query.asset_id as string, 10) : undefined;
  const affected_person_id = req.query.affected_person_id ? parseInt(req.query.affected_person_id as string, 10) : undefined;
  const category = (req.query.category as string) || undefined;

  try {
    const result = await checkDuplicateTickets({ asset_id, affected_person_id, category });
    res.json({
      success: true,
      data: result,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: 'DUPLICATE_CHECK_ERROR', message: err.message },
    });
  }
});

// 7. GET /api/v1/tickets - Paginated search and filtering
ticketRouter.get('/', requireAuth, async (req: Request, res: Response) => {
  const parseResult = searchTicketsSchema.safeParse(req.query);
  if (!parseResult.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_QUERY_PARAMS',
        message: 'Invalid query parameters for ticket search',
        details: parseResult.error.format(),
      },
    });
  }

  const {
    search,
    status,
    category,
    priority,
    department_id,
    asset_id,
    officer_id,
    date_from,
    date_to,
    is_draft,
    page,
    limit,
    sortBy,
    sortOrder,
  } = parseResult.data;

  const pool = getPool();
  const whereClauses: string[] = [];
  const params: any[] = [];

  // Exclude drafts by default
  if (is_draft !== 'all') {
    whereClauses.push('t.is_draft = ?');
    params.push(is_draft === 'true' ? 1 : 0);
  }

  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    whereClauses.push(
      '(t.ticket_number LIKE ? OR t.title LIKE ? OR t.description LIKE ? OR a.hostname LIKE ? OR p.full_name LIKE ?)'
    );
    params.push(term, term, term, term, term);
  }

  if (status !== 'all') {
    whereClauses.push('t.status = ?');
    params.push(status);
  }

  if (category !== 'all') {
    whereClauses.push('t.category = ?');
    params.push(category);
  }

  if (priority !== 'all') {
    whereClauses.push('t.priority = ?');
    params.push(priority);
  }

  if (department_id) {
    whereClauses.push('t.department_id = ?');
    params.push(department_id);
  }

  if (asset_id) {
    whereClauses.push('t.asset_id = ?');
    params.push(asset_id);
  }

  if (officer_id) {
    whereClauses.push('t.created_by_id = ?');
    params.push(officer_id);
  }

  if (date_from) {
    whereClauses.push('DATE(t.created_at) >= ?');
    params.push(date_from);
  }

  if (date_to) {
    whereClauses.push('DATE(t.created_at) <= ?');
    params.push(date_to);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  // Count total records
  const countSql = `
    SELECT COUNT(*) as total
    FROM tickets t
    LEFT JOIN assets a ON t.asset_id = a.id
    LEFT JOIN directory_people p ON t.affected_person_id = p.id
    ${whereSql}
  `;
  const [countRows]: any = await pool.query(countSql, params);
  const total = Number(countRows[0]?.total || 0);

  // Paginated query
  const offset = (page - 1) * limit;
  const safeSortOrder = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  const sortMap: Record<string, string> = {
    created_at: 't.created_at',
    updated_at: 't.updated_at',
    priority: 'FIELD(t.priority, "critical", "high", "normal", "low")',
    status: 't.status',
    ticket_number: 't.ticket_number',
  };
  const safeSortColumn = sortMap[sortBy] || 't.created_at';

  const selectSql = `
    SELECT t.id, t.ticket_number, t.title, t.category, t.priority, t.status,
           t.department_id, t.asset_id, t.affected_person_id, t.created_by_id,
           t.resolved_by_id, t.resolved_at, t.resolution_summary, t.is_draft,
           t.created_at, t.updated_at,
           d.name as department_name, d.code as department_code,
           a.hostname as asset_hostname, a.asset_tag,
           p.full_name as affected_person_name, p.staff_id as affected_staff_id,
           u_creator.full_name as creator_name,
           u_resolver.full_name as resolver_name
    FROM tickets t
    LEFT JOIN departments d ON t.department_id = d.id
    LEFT JOIN assets a ON t.asset_id = a.id
    LEFT JOIN directory_people p ON t.affected_person_id = p.id
    LEFT JOIN app_users u_creator ON t.created_by_id = u_creator.id
    LEFT JOIN app_users u_resolver ON t.resolved_by_id = u_resolver.id
    ${whereSql}
    ORDER BY ${safeSortColumn} ${safeSortOrder}
    LIMIT ? OFFSET ?
  `;

  const [rows]: any = await pool.query(selectSql, [...params, limit, offset]);

  res.json({
    success: true,
    data: rows,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// 8. GET /api/v1/tickets/:id - Full ticket detail with timeline events
ticketRouter.get('/:id', requireAuth, async (req: Request, res: Response) => {
  const ticketId = parseInt(req.params.id, 10);
  if (isNaN(ticketId)) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_ID', message: 'Invalid ticket ID' },
    });
  }

  try {
    const ticket = await getTicketById(ticketId);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        error: { code: 'TICKET_NOT_FOUND', message: 'Ticket not found' },
      });
    }

    res.json({
      success: true,
      data: ticket,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: 'TICKET_FETCH_ERROR', message: err.message },
    });
  }
});

// 9. POST /api/v1/tickets/:id/transitions - Advance status & append timeline event (Transactional)
ticketRouter.post('/:id/transitions', requireRole(['ict_officer', 'administrator']), async (req: Request, res: Response) => {
  const ticketId = parseInt(req.params.id, 10);
  if (isNaN(ticketId)) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_ID', message: 'Invalid ticket ID' },
    });
  }

  const parseResult = transitionPayloadSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid status transition payload',
        details: parseResult.error.format(),
      },
    });
  }

  try {
    const updatedTicket = await transitionTicketStatus(ticketId, parseResult.data, req.user!.id, req.ip);
    res.json({
      success: true,
      data: updatedTicket,
    });
  } catch (err: any) {
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      error: { code: err.code || 'TRANSITION_ERROR', message: err.message },
    });
  }
});

// 10. POST /api/v1/tickets/:id/events - Append progress note to timeline
ticketRouter.post('/:id/events', requireRole(['ict_officer', 'administrator']), async (req: Request, res: Response) => {
  const ticketId = parseInt(req.params.id, 10);
  if (isNaN(ticketId)) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_ID', message: 'Invalid ticket ID' },
    });
  }

  const parseResult = notePayloadSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Note must be at least 2 characters',
        details: parseResult.error.format(),
      },
    });
  }

  try {
    const updatedTicket = await addTicketNote(ticketId, parseResult.data.note, req.user!.id, req.ip);
    res.json({
      success: true,
      data: updatedTicket,
    });
  } catch (err: any) {
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      error: { code: err.code || 'NOTE_ADD_ERROR', message: err.message },
    });
  }
});
