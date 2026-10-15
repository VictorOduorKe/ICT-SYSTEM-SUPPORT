import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getPool } from '../../db/pool.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { recordAuditLog } from '../audit/audit.service.js';

export const directoryRouter = Router();

const searchPeopleSchema = z.object({
  search: z.string().optional(),
  department_id: z.coerce.number().int().positive().optional(),
  is_active: z.enum(['true', 'false', 'all']).optional().default('true'),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  sortBy: z.enum(['full_name', 'staff_id', 'created_at']).optional().default('full_name'),
  sortOrder: z.enum(['ASC', 'DESC', 'asc', 'desc']).optional().default('ASC'),
});

// GET /api/v1/directory/people - Paginated search of staff directory
directoryRouter.get('/people', requireAuth, async (req: Request, res: Response) => {
  const parseResult = searchPeopleSchema.safeParse(req.query);
  if (!parseResult.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_QUERY_PARAMS',
        message: 'Invalid query parameters for directory search',
        details: parseResult.error.format(),
      },
    });
  }

  const { search, department_id, is_active, page, limit, sortBy, sortOrder } = parseResult.data;
  const pool = getPool();

  const whereClauses: string[] = [];
  const params: any[] = [];

  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    whereClauses.push('(p.full_name LIKE ? OR p.staff_id LIKE ? OR p.email LIKE ? OR p.phone LIKE ?)');
    params.push(term, term, term, term);
  }

  if (department_id) {
    whereClauses.push('p.department_id = ?');
    params.push(department_id);
  }

  if (is_active !== 'all') {
    whereClauses.push('p.is_active = ?');
    params.push(is_active === 'true' ? 1 : 0);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  // Count total records
  const countSql = `SELECT COUNT(*) as total FROM directory_people p ${whereSql}`;
  const [countRows]: any = await pool.query(countSql, params);
  const total = Number(countRows[0]?.total || 0);

  // Fetch paginated results with joined department
  const offset = (page - 1) * limit;
  const safeSortBy = sortBy === 'staff_id' ? 'p.staff_id' : sortBy === 'created_at' ? 'p.created_at' : 'p.full_name';
  const safeSortOrder = sortOrder.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

  const dataSql = `
    SELECT 
      p.id,
      p.staff_id,
      p.full_name,
      p.email,
      p.phone,
      p.department_id,
      d.name as department_name,
      d.code as department_code,
      p.is_active,
      p.created_at,
      p.updated_at
    FROM directory_people p
    LEFT JOIN departments d ON p.department_id = d.id
    ${whereSql}
    ORDER BY ${safeSortBy} ${safeSortOrder}
    LIMIT ? OFFSET ?
  `;

  const queryParams = [...params, limit, offset];
  const [items] = await pool.query<any[]>(dataSql, queryParams);

  res.json({
    success: true,
    data: {
      items,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    },
  });
});

const createPersonSchema = z.object({
  staff_id: z.string().min(2, 'Staff identifier is required').trim(),
  full_name: z.string().min(2, 'Full name is required').trim(),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  phone: z.string().optional(),
  department_id: z.coerce.number().int().positive('Valid department must be selected'),
});

// POST /api/v1/directory/people - Create staff member (ICT Officer or Administrator)
directoryRouter.post(
  '/people',
  requireRole(['ict_officer', 'administrator']),
  async (req: Request, res: Response) => {
    const parseResult = createPersonSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid staff directory payload',
          details: parseResult.error.format(),
        },
      });
    }

    const { staff_id, full_name, email, phone, department_id } = parseResult.data;
    const normalizedStaffId = staff_id.trim();
    const pool = getPool();

    // 1. Strict Duplicate Check on Staff ID
    const [existing] = await pool.query<any[]>(
      `SELECT p.id, p.staff_id, p.full_name, p.department_id, d.name as department_name
       FROM directory_people p
       LEFT JOIN departments d ON p.department_id = d.id
       WHERE LOWER(p.staff_id) = LOWER(?)`,
      [normalizedStaffId]
    );

    if (Array.isArray(existing) && existing.length > 0) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'DUPLICATE_STAFF_ID',
          message: `A staff member with Staff ID '${normalizedStaffId}' already exists (${existing[0].full_name}).`,
          existingRecord: existing[0],
        },
      });
    }

    // 2. Insert into database
    const [result]: any = await pool.query(
      `INSERT INTO directory_people (staff_id, full_name, email, phone, department_id, is_active)
       VALUES (?, ?, ?, ?, ?, TRUE)`,
      [normalizedStaffId, full_name, email || null, phone || null, department_id]
    );

    await recordAuditLog({
      actorId: req.user?.id,
      action: 'DIRECTORY_PERSON_CREATED',
      entityType: 'directory_people',
      entityId: result.insertId,
      details: { staff_id: normalizedStaffId, full_name, department_id },
      req,
    });

    res.status(201).json({
      success: true,
      data: {
        id: result.insertId,
        staff_id: normalizedStaffId,
        full_name,
        email: email || null,
        phone: phone || null,
        department_id,
        is_active: true,
      },
    });
  }
);

// GET /api/v1/directory/people/:id - Retrieve person details
directoryRouter.get('/people/:id', requireAuth, async (req: Request, res: Response) => {
  const pool = getPool();
  const [rows] = await pool.query<any[]>(
    `SELECT 
      p.id, p.staff_id, p.full_name, p.email, p.phone, p.department_id,
      d.name as department_name, d.code as department_code,
      p.is_active, p.created_at, p.updated_at
     FROM directory_people p
     LEFT JOIN departments d ON p.department_id = d.id
     WHERE p.id = ?`,
    [req.params.id]
  );

  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Staff directory record not found' },
    });
  }

  res.json({ success: true, data: rows[0] });
});

// PATCH /api/v1/directory/people/:id - Update person record
directoryRouter.patch(
  '/people/:id',
  requireRole(['ict_officer', 'administrator']),
  async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid person ID' } });
    }

    const pool = getPool();
    const [existing] = await pool.query<any[]>('SELECT * FROM directory_people WHERE id = ?', [id]);
    if (!Array.isArray(existing) || existing.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Record not found' } });
    }

    const { full_name, email, phone, department_id, is_active } = req.body;

    const updates: string[] = [];
    const params: any[] = [];

    if (full_name !== undefined) {
      updates.push('full_name = ?');
      params.push(full_name.trim());
    }
    if (email !== undefined) {
      updates.push('email = ?');
      params.push(email ? email.trim() : null);
    }
    if (phone !== undefined) {
      updates.push('phone = ?');
      params.push(phone ? phone.trim() : null);
    }
    if (department_id !== undefined) {
      updates.push('department_id = ?');
      params.push(department_id);
    }
    if (is_active !== undefined) {
      updates.push('is_active = ?');
      params.push(Boolean(is_active));
    }

    if (updates.length === 0) {
      return res.json({ success: true, data: existing[0] });
    }

    params.push(id);
    await pool.query(`UPDATE directory_people SET ${updates.join(', ')} WHERE id = ?`, params);

    await recordAuditLog({
      actorId: req.user?.id,
      action: 'DIRECTORY_PERSON_UPDATED',
      entityType: 'directory_people',
      entityId: id,
      details: req.body,
      req,
    });

    res.json({ success: true, message: 'Staff directory record updated successfully' });
  }
);
