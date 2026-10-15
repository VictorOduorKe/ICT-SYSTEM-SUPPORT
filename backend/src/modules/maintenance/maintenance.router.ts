import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getPool } from '../../db/pool.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { recordAuditLog } from '../audit/audit.service.js';

export const maintenanceRouter = Router();

const searchMaintenanceSchema = z.object({
  search: z.string().optional(),
  department_id: z.coerce.number().int().positive().optional(),
  asset_id: z.coerce.number().int().positive().optional(),
  officer_id: z.coerce.number().int().positive().optional(),
  maintenance_type: z.string().optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  sortBy: z.enum(['maintenance_date', 'created_at', 'maintenance_type']).optional().default('maintenance_date'),
  sortOrder: z.enum(['ASC', 'DESC', 'asc', 'desc']).optional().default('DESC'),
});

const createMaintenanceSchema = z.object({
  maintenance_date: z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Date must be formatted as YYYY-MM-DD'),
  department_id: z.coerce.number().int().positive('Please select a valid department'),
  asset_id: z.coerce.number().int().positive().nullable().optional(),
  maintenance_type: z.string().min(2, 'Maintenance type is required').max(100),
  work_performed: z.string().min(5, 'Work performed must be at least 5 characters'),
  result: z.string().max(100).default('Completed'),
  notes: z.string().nullable().optional(),
});

// 1. GET /api/v1/maintenance - Paginated search of routine maintenance records
maintenanceRouter.get('/', requireAuth, async (req: Request, res: Response) => {
  const parseResult = searchMaintenanceSchema.safeParse(req.query);
  if (!parseResult.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_QUERY_PARAMS',
        message: 'Invalid query parameters for maintenance log',
        details: parseResult.error.format(),
      },
    });
  }

  const {
    search,
    department_id,
    asset_id,
    officer_id,
    maintenance_type,
    date_from,
    date_to,
    page,
    limit,
    sortBy,
    sortOrder,
  } = parseResult.data;

  const pool = getPool();
  const whereClauses: string[] = [];
  const params: any[] = [];

  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    whereClauses.push(
      '(m.maintenance_type LIKE ? OR m.work_performed LIKE ? OR m.notes LIKE ? OR a.hostname LIKE ?)'
    );
    params.push(term, term, term, term);
  }

  if (department_id) {
    whereClauses.push('m.department_id = ?');
    params.push(department_id);
  }

  if (asset_id) {
    whereClauses.push('m.asset_id = ?');
    params.push(asset_id);
  }

  if (officer_id) {
    whereClauses.push('m.officer_id = ?');
    params.push(officer_id);
  }

  if (maintenance_type && maintenance_type.trim() && maintenance_type !== 'ALL') {
    whereClauses.push('m.maintenance_type = ?');
    params.push(maintenance_type.trim());
  }

  if (date_from) {
    whereClauses.push('m.maintenance_date >= ?');
    params.push(date_from);
  }

  if (date_to) {
    whereClauses.push('m.maintenance_date <= ?');
    params.push(date_to);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  // Count total records
  const countSql = `
    SELECT COUNT(*) as total
    FROM maintenance_records m
    LEFT JOIN assets a ON m.asset_id = a.id
    ${whereSql}
  `;
  const [countRows]: any = await pool.query(countSql, params);
  const total = Number(countRows[0]?.total || 0);

  // Paginated query
  const offset = (page - 1) * limit;
  const safeSortOrder = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  const sortMap: Record<string, string> = {
    maintenance_date: 'm.maintenance_date',
    created_at: 'm.created_at',
    maintenance_type: 'm.maintenance_type',
  };
  const safeSortColumn = sortMap[sortBy] || 'm.maintenance_date';

  const selectSql = `
    SELECT m.id, m.maintenance_date, m.maintenance_type, m.work_performed,
           m.result, m.notes, m.created_at, m.updated_at,
           m.department_id, d.name as department_name, d.code as department_code,
           m.asset_id, a.hostname as asset_hostname, a.asset_tag, a.device_type,
           m.officer_id, u.full_name as officer_name, u.username as officer_username
    FROM maintenance_records m
    LEFT JOIN departments d ON m.department_id = d.id
    LEFT JOIN assets a ON m.asset_id = a.id
    LEFT JOIN app_users u ON m.officer_id = u.id
    ${whereSql}
    ORDER BY ${safeSortColumn} ${safeSortOrder}, m.id DESC
    LIMIT ? OFFSET ?
  `;

  const [rows]: any = await pool.query(selectSql, [...params, limit, offset]);

  res.json({
    success: true,
    data: {
      items: rows,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    },
  });
});

// 2. POST /api/v1/maintenance - Create routine maintenance record (ICT Officer & Administrator)
maintenanceRouter.post(
  '/',
  requireRole(['ict_officer', 'administrator']),
  async (req: Request, res: Response) => {
    const parseResult = createMaintenanceSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid maintenance record payload',
          details: parseResult.error.format(),
        },
      });
    }

    const {
      maintenance_date,
      department_id,
      asset_id,
      maintenance_type,
      work_performed,
      result,
      notes,
    } = parseResult.data;

    const pool = getPool();
    const officerId = req.user!.id;

    const [insertResult]: any = await pool.query(
      `INSERT INTO maintenance_records (
         maintenance_date, department_id, asset_id, maintenance_type,
         work_performed, result, officer_id, notes
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        maintenance_date,
        department_id,
        asset_id || null,
        maintenance_type.trim(),
        work_performed.trim(),
        result.trim(),
        officerId,
        notes?.trim() || null,
      ]
    );

    const recordId = insertResult.insertId;

    await recordAuditLog({
      actorId: officerId,
      action: 'maintenance_create',
      entityType: 'maintenance',
      entityId: String(recordId),
      details: {
        maintenance_date,
        department_id,
        asset_id,
        maintenance_type,
      },
      req,
    });

    // Fetch the created record with joins
    const [rows]: any = await pool.query(
      `SELECT m.*, d.name as department_name, a.hostname as asset_hostname, u.full_name as officer_name
       FROM maintenance_records m
       LEFT JOIN departments d ON m.department_id = d.id
       LEFT JOIN assets a ON m.asset_id = a.id
       LEFT JOIN app_users u ON m.officer_id = u.id
       WHERE m.id = ?`,
      [recordId]
    );

    res.status(201).json({
      success: true,
      data: rows[0],
    });
  }
);

// 3. GET /api/v1/maintenance/:id - Detail view
maintenanceRouter.get('/:id', requireAuth, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_ID', message: 'Invalid maintenance record ID' },
    });
  }

  const pool = getPool();
  const [rows]: any = await pool.query(
    `SELECT m.*, d.name as department_name, d.code as department_code,
            a.hostname as asset_hostname, a.asset_tag, a.device_type,
            u.full_name as officer_name, u.role as officer_role
     FROM maintenance_records m
     LEFT JOIN departments d ON m.department_id = d.id
     LEFT JOIN assets a ON m.asset_id = a.id
     LEFT JOIN app_users u ON m.officer_id = u.id
     WHERE m.id = ?`,
    [id]
  );

  if (rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Maintenance record not found' },
    });
  }

  res.json({
    success: true,
    data: rows[0],
  });
});
