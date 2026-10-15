import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getPool } from '../../db/pool.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { recordAuditLog } from '../audit/audit.service.js';

export const inventoryRouter = Router();

const searchAssetsSchema = z.object({
  search: z.string().optional(),
  department_id: z.coerce.number().int().positive().optional(),
  device_type: z.string().optional(),
  is_archived: z.enum(['true', 'false', 'all']).optional().default('false'),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  sortBy: z.enum(['hostname', 'asset_tag', 'device_type', 'created_at']).optional().default('hostname'),
  sortOrder: z.enum(['ASC', 'DESC', 'asc', 'desc']).optional().default('ASC'),
});

// GET /api/v1/assets - Paginated search of hardware inventory
inventoryRouter.get('/', requireAuth, async (req: Request, res: Response) => {
  const parseResult = searchAssetsSchema.safeParse(req.query);
  if (!parseResult.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_QUERY_PARAMS',
        message: 'Invalid query parameters for asset inventory search',
        details: parseResult.error.format(),
      },
    });
  }

  const { search, department_id, device_type, is_archived, page, limit, sortBy, sortOrder } = parseResult.data;
  const pool = getPool();

  const whereClauses: string[] = [];
  const params: any[] = [];

  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    whereClauses.push(
      '(a.hostname LIKE ? OR a.asset_tag LIKE ? OR a.ip_address LIKE ? OR a.location LIKE ? OR p.full_name LIKE ?)'
    );
    params.push(term, term, term, term, term);
  }

  if (department_id) {
    whereClauses.push('a.department_id = ?');
    params.push(department_id);
  }

  if (device_type && device_type.trim() && device_type !== 'ALL') {
    whereClauses.push('a.device_type = ?');
    params.push(device_type.trim());
  }

  if (is_archived !== 'all') {
    whereClauses.push('a.is_archived = ?');
    params.push(is_archived === 'true' ? 1 : 0);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  // Count total records
  const countSql = `
    SELECT COUNT(*) as total 
    FROM assets a 
    LEFT JOIN directory_people p ON a.assigned_person_id = p.id
    ${whereSql}
  `;
  const [countRows]: any = await pool.query(countSql, params);
  const total = Number(countRows[0]?.total || 0);

  // Fetch paginated results with joined department and assigned person
  const offset = (page - 1) * limit;
  const safeSortBy =
    sortBy === 'asset_tag'
      ? 'a.asset_tag'
      : sortBy === 'device_type'
      ? 'a.device_type'
      : sortBy === 'created_at'
      ? 'a.created_at'
      : 'a.hostname';
  const safeSortOrder = sortOrder.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

  const dataSql = `
    SELECT 
      a.id,
      a.hostname,
      a.asset_tag,
      a.device_type,
      a.department_id,
      d.name as department_name,
      d.code as department_code,
      a.assigned_person_id,
      p.full_name as assigned_person_name,
      p.staff_id as assigned_person_staff_id,
      a.location,
      a.operating_system,
      a.ip_address,
      a.is_archived,
      a.notes,
      a.created_at,
      a.updated_at
    FROM assets a
    LEFT JOIN departments d ON a.department_id = d.id
    LEFT JOIN directory_people p ON a.assigned_person_id = p.id
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

const createAssetSchema = z.object({
  hostname: z.string().min(2, 'Hostname must be at least 2 characters').trim(),
  asset_tag: z.string().trim().optional().or(z.literal('')),
  device_type: z.string().min(2, 'Device type is required').default('Desktop'),
  department_id: z.coerce.number().int().positive().optional().nullable(),
  assigned_person_id: z.coerce.number().int().positive().optional().nullable(),
  location: z.string().trim().optional(),
  operating_system: z.string().trim().optional(),
  ip_address: z.string().trim().optional(),
  notes: z.string().optional(),
});

// POST /api/v1/assets - Register computer / hardware asset
inventoryRouter.post(
  '/',
  requireRole(['ict_officer', 'administrator']),
  async (req: Request, res: Response) => {
    const parseResult = createAssetSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid asset payload',
          details: parseResult.error.format(),
        },
      });
    }

    const {
      hostname,
      asset_tag,
      device_type,
      department_id,
      assigned_person_id,
      location,
      operating_system,
      ip_address,
      notes,
    } = parseResult.data;

    const normalizedHostname = hostname.trim();
    const normalizedAssetTag = asset_tag && asset_tag.trim() ? asset_tag.trim().toUpperCase() : null;
    const pool = getPool();

    // 1. Strict Duplicate Check on Hostname
    const [existingHostname] = await pool.query<any[]>(
      `SELECT a.id, a.hostname, a.asset_tag, a.device_type, d.name as department_name
       FROM assets a
       LEFT JOIN departments d ON a.department_id = d.id
       WHERE LOWER(a.hostname) = LOWER(?)`,
      [normalizedHostname]
    );

    if (Array.isArray(existingHostname) && existingHostname.length > 0) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'DUPLICATE_HOSTNAME',
          message: `A computer with hostname '${normalizedHostname}' already exists in inventory.`,
          existingAsset: existingHostname[0],
        },
      });
    }

    // 2. Strict Duplicate Check on Asset Tag (if provided)
    if (normalizedAssetTag) {
      const [existingAssetTag] = await pool.query<any[]>(
        `SELECT a.id, a.hostname, a.asset_tag, a.device_type, d.name as department_name
         FROM assets a
         LEFT JOIN departments d ON a.department_id = d.id
         WHERE a.asset_tag = ?`,
        [normalizedAssetTag]
      );

      if (Array.isArray(existingAssetTag) && existingAssetTag.length > 0) {
        return res.status(409).json({
          success: false,
          error: {
            code: 'DUPLICATE_ASSET_TAG',
            message: `A computer with Asset Tag '${normalizedAssetTag}' already exists (Hostname: ${existingAssetTag[0].hostname}).`,
            existingAsset: existingAssetTag[0],
          },
        });
      }
    }

    // 3. Insert into assets table
    const [result]: any = await pool.query(
      `INSERT INTO assets 
        (hostname, asset_tag, device_type, department_id, assigned_person_id, location, operating_system, ip_address, notes, is_archived)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, FALSE)`,
      [
        normalizedHostname,
        normalizedAssetTag,
        device_type,
        department_id || null,
        assigned_person_id || null,
        location || null,
        operating_system || null,
        ip_address || null,
        notes || null,
      ]
    );

    await recordAuditLog({
      actorId: req.user?.id,
      action: 'ASSET_CREATED',
      entityType: 'assets',
      entityId: result.insertId,
      details: { hostname: normalizedHostname, asset_tag: normalizedAssetTag, device_type },
      req,
    });

    res.status(201).json({
      success: true,
      data: {
        id: result.insertId,
        hostname: normalizedHostname,
        asset_tag: normalizedAssetTag,
        device_type,
        department_id,
        assigned_person_id,
        is_archived: false,
      },
    });
  }
);

// GET /api/v1/assets/:id - Retrieve single asset
inventoryRouter.get('/:id', requireAuth, async (req: Request, res: Response) => {
  const pool = getPool();
  const [rows] = await pool.query<any[]>(
    `SELECT 
      a.id, a.hostname, a.asset_tag, a.device_type, a.department_id,
      d.name as department_name, d.code as department_code,
      a.assigned_person_id, p.full_name as assigned_person_name, p.staff_id as assigned_person_staff_id,
      a.location, a.operating_system, a.ip_address, a.is_archived, a.notes,
      a.created_at, a.updated_at
     FROM assets a
     LEFT JOIN departments d ON a.department_id = d.id
     LEFT JOIN directory_people p ON a.assigned_person_id = p.id
     WHERE a.id = ?`,
    [req.params.id]
  );

  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Hardware asset not found' },
    });
  }

  res.json({ success: true, data: rows[0] });
});

// PATCH /api/v1/assets/:id - Update or archive asset
inventoryRouter.patch(
  '/:id',
  requireRole(['ict_officer', 'administrator']),
  async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid asset ID' } });
    }

    const pool = getPool();
    const [existing] = await pool.query<any[]>('SELECT * FROM assets WHERE id = ?', [id]);
    if (!Array.isArray(existing) || existing.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Asset not found' } });
    }

    const {
      hostname,
      asset_tag,
      device_type,
      department_id,
      assigned_person_id,
      location,
      operating_system,
      ip_address,
      notes,
      is_archived,
    } = req.body;

    const updates: string[] = [];
    const params: any[] = [];

    if (hostname !== undefined) {
      updates.push('hostname = ?');
      params.push(hostname.trim());
    }
    if (asset_tag !== undefined) {
      updates.push('asset_tag = ?');
      params.push(asset_tag && asset_tag.trim() ? asset_tag.trim().toUpperCase() : null);
    }
    if (device_type !== undefined) {
      updates.push('device_type = ?');
      params.push(device_type.trim());
    }
    if (department_id !== undefined) {
      updates.push('department_id = ?');
      params.push(department_id || null);
    }
    if (assigned_person_id !== undefined) {
      updates.push('assigned_person_id = ?');
      params.push(assigned_person_id || null);
    }
    if (location !== undefined) {
      updates.push('location = ?');
      params.push(location ? location.trim() : null);
    }
    if (operating_system !== undefined) {
      updates.push('operating_system = ?');
      params.push(operating_system ? operating_system.trim() : null);
    }
    if (ip_address !== undefined) {
      updates.push('ip_address = ?');
      params.push(ip_address ? ip_address.trim() : null);
    }
    if (notes !== undefined) {
      updates.push('notes = ?');
      params.push(notes || null);
    }
    if (is_archived !== undefined) {
      updates.push('is_archived = ?');
      params.push(Boolean(is_archived));
    }

    if (updates.length === 0) {
      return res.json({ success: true, data: existing[0] });
    }

    params.push(id);
    await pool.query(`UPDATE assets SET ${updates.join(', ')} WHERE id = ?`, params);

    await recordAuditLog({
      actorId: req.user?.id,
      action: 'ASSET_UPDATED',
      entityType: 'assets',
      entityId: id,
      details: req.body,
      req,
    });

    res.json({ success: true, message: 'Asset updated successfully' });
  }
);
