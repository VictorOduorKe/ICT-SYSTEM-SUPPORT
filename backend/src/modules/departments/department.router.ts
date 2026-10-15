import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getPool } from '../../db/pool.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { recordAuditLog } from '../audit/audit.service.js';

export const departmentRouter = Router();

// GET /api/v1/departments - List all active departments
departmentRouter.get('/', requireAuth, async (_req: Request, res: Response) => {
  const pool = getPool();
  const [rows] = await pool.query<any[]>(
    'SELECT id, name, code, is_active, created_at FROM departments WHERE is_active = TRUE ORDER BY name ASC'
  );

  res.json({
    success: true,
    data: rows,
  });
});

const createDeptSchema = z.object({
  name: z.string().min(2, 'Department name must be at least 2 characters').trim(),
  code: z.string().min(2, 'Department code must be at least 2 characters').max(10).trim().toUpperCase(),
});

// POST /api/v1/departments - Create department (Admin only)
departmentRouter.post('/', requireRole(['administrator']), async (req: Request, res: Response) => {
  const parseResult = createDeptSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid department payload',
        details: parseResult.error.format(),
      },
    });
  }

  const { name, code } = parseResult.data;
  const pool = getPool();

  // Duplicate check
  const [existing] = await pool.query<any[]>(
    'SELECT id, name, code FROM departments WHERE LOWER(name) = LOWER(?) OR code = ?',
    [name, code]
  );

  if (Array.isArray(existing) && existing.length > 0) {
    return res.status(409).json({
      success: false,
      error: {
        code: 'DUPLICATE_DEPARTMENT',
        message: 'A department with this name or code already exists.',
        existing: existing[0],
      },
    });
  }

  const [result]: any = await pool.query(
    'INSERT INTO departments (name, code, is_active) VALUES (?, ?, TRUE)',
    [name, code]
  );

  await recordAuditLog({
    actorId: req.user?.id,
    action: 'DEPARTMENT_CREATED',
    entityType: 'departments',
    entityId: result.insertId,
    details: { name, code },
    req,
  });

  res.status(201).json({
    success: true,
    data: {
      id: result.insertId,
      name,
      code,
      is_active: true,
    },
  });
});
