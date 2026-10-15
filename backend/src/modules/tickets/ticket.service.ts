import { PoolConnection } from 'mysql2/promise';
import { getPool } from '../../db/pool.js';
import { recordAuditLog } from '../audit/audit.service.js';

export interface TicketDraftPayload {
  title?: string;
  description?: string;
  category?: 'hardware' | 'network' | 'printer' | 'software' | 'access' | 'security' | 'maintenance' | 'other';
  priority?: 'low' | 'normal' | 'high' | 'critical';
  department_id?: number | null;
  asset_id?: number | null;
  affected_person_id?: number | null;
}

export interface TicketSubmitPayload {
  title: string;
  description: string;
  category: 'hardware' | 'network' | 'printer' | 'software' | 'access' | 'security' | 'maintenance' | 'other';
  priority: 'low' | 'normal' | 'high' | 'critical';
  department_id: number;
  asset_id?: number | null;
  affected_person_id?: number | null;
  idempotency_key?: string | null;
}

export interface StatusTransitionPayload {
  target_status: 'pending' | 'in_progress' | 'resolved' | 'cancelled';
  note: string;
  resolution_summary?: string | null;
}

/**
 * Generates the next sequential ticket reference number for the day:
 * Format: ICT-YYYYMMDD-XXXX (e.g. ICT-20261014-0001)
 */
export async function generateTicketNumber(connection: PoolConnection): Promise<string> {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const datePrefix = `ICT-${year}${month}${day}-`;

  // Lock rows for today to get sequential sequence
  const [rows]: any = await connection.query(
    `SELECT ticket_number 
     FROM tickets 
     WHERE ticket_number LIKE ? 
     ORDER BY id DESC 
     LIMIT 1 
     FOR UPDATE`,
    [`${datePrefix}%`]
  );

  let nextSeq = 1;
  if (rows.length > 0 && rows[0].ticket_number) {
    const lastNumber = rows[0].ticket_number as string;
    const parts = lastNumber.split('-');
    if (parts.length === 3) {
      const parsed = parseInt(parts[2], 10);
      if (!isNaN(parsed)) {
        nextSeq = parsed + 1;
      }
    }
  }

  return `${datePrefix}${String(nextSeq).padStart(4, '0')}`;
}

/**
 * Creates a new draft support ticket for the active officer.
 */
export async function createTicketDraft(userId: number): Promise<any> {
  const pool = getPool();
  const draftNumber = `DFT-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`;

  const [result]: any = await pool.query(
    `INSERT INTO tickets (
       ticket_number, title, description, category, priority, status,
       created_by_id, is_draft, draft_version
     ) VALUES (?, ?, ?, ?, ?, ?, ?, TRUE, 1)`,
    [draftNumber, '(Untitled Draft)', '', 'other', 'normal', 'pending', userId]
  );

  const draftId = result.insertId;

  return {
    id: draftId,
    ticket_number: draftNumber,
    title: '(Untitled Draft)',
    description: '',
    category: 'other',
    priority: 'normal',
    status: 'pending',
    is_draft: true,
    draft_version: 1,
    department_id: null,
    asset_id: null,
    affected_person_id: null,
    created_at: new Date().toISOString(),
  };
}

/**
 * Finds an unsubmitted draft owned by the given user.
 */
export async function getActiveDraftForUser(userId: number): Promise<any | null> {
  const pool = getPool();
  const [rows]: any = await pool.query(
    `SELECT t.*, d.name as department_name, a.hostname as asset_hostname, p.full_name as affected_person_name
     FROM tickets t
     LEFT JOIN departments d ON t.department_id = d.id
     LEFT JOIN assets a ON t.asset_id = a.id
     LEFT JOIN directory_people p ON t.affected_person_id = p.id
     WHERE t.created_by_id = ? AND t.is_draft = TRUE
     ORDER BY t.updated_at DESC
     LIMIT 1`,
    [userId]
  );

  return rows.length > 0 ? rows[0] : null;
}

/**
 * Autosaves partial form entries into the draft with optimistic locking (draft_version).
 * Throws an error with code 'CONCURRENCY_CONFLICT' if client_version does not match.
 */
export async function autosaveTicketDraft(
  draftId: number,
  clientVersion: number,
  payload: TicketDraftPayload,
  userId: number
): Promise<{ success: boolean; draft_version: number; saved_at: string }> {
  const pool = getPool();

  // 1. Fetch current draft state
  const [rows]: any = await pool.query(
    `SELECT id, is_draft, draft_version, title, description, category, priority, 
            department_id, asset_id, affected_person_id, updated_at
     FROM tickets 
     WHERE id = ?`,
    [draftId]
  );

  if (rows.length === 0) {
    const error: any = new Error('Draft not found');
    error.code = 'DRAFT_NOT_FOUND';
    error.status = 404;
    throw error;
  }

  const current = rows[0];
  if (!current.is_draft) {
    const error: any = new Error('This ticket has already been submitted and cannot be updated via draft autosave');
    error.code = 'TICKET_ALREADY_SUBMITTED';
    error.status = 400;
    throw error;
  }

  // Optimistic concurrency check
  if (Number(current.draft_version) !== Number(clientVersion)) {
    const error: any = new Error(
      `Autosave conflict: Draft was modified in another session (current version ${current.draft_version}, received ${clientVersion})`
    );
    error.code = 'CONCURRENCY_CONFLICT';
    error.status = 409;
    error.currentDraft = current;
    throw error;
  }

  const nextVersion = current.draft_version + 1;

  // Build dynamic update for fields present
  const updates: string[] = ['draft_version = ?', 'updated_by_id = ?'];
  const params: any[] = [nextVersion, userId];

  if (payload.title !== undefined) {
    updates.push('title = ?');
    params.push(payload.title);
  }
  if (payload.description !== undefined) {
    updates.push('description = ?');
    params.push(payload.description);
  }
  if (payload.category !== undefined) {
    updates.push('category = ?');
    params.push(payload.category);
  }
  if (payload.priority !== undefined) {
    updates.push('priority = ?');
    params.push(payload.priority);
  }
  if (payload.department_id !== undefined) {
    updates.push('department_id = ?');
    params.push(payload.department_id);
  }
  if (payload.asset_id !== undefined) {
    updates.push('asset_id = ?');
    params.push(payload.asset_id);
  }
  if (payload.affected_person_id !== undefined) {
    updates.push('affected_person_id = ?');
    params.push(payload.affected_person_id);
  }

  params.push(draftId);

  await pool.query(
    `UPDATE tickets 
     SET ${updates.join(', ')} 
     WHERE id = ?`,
    params
  );

  return {
    success: true,
    draft_version: nextVersion,
    saved_at: new Date().toISOString(),
  };
}

/**
 * Submits a draft ticket or creates a new submitted ticket.
 * Atomically generates official ticket number, marks is_draft = false,
 * and records the initial 'created' event in ticket_events inside a transaction.
 */
export async function submitTicket(
  draftId: number | null,
  payload: TicketSubmitPayload,
  userId: number,
  clientIp?: string
): Promise<any> {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Check idempotency if key provided
    if (payload.idempotency_key && payload.idempotency_key.trim()) {
      const [existing]: any = await connection.query(
        `SELECT id, ticket_number, status, created_at 
         FROM tickets 
         WHERE idempotency_key = ?`,
        [payload.idempotency_key.trim()]
      );

      if (existing.length > 0) {
        await connection.rollback();
        connection.release();
        return getTicketById(existing[0].id);
      }
    }

    // Generate official sequential ticket number
    const officialTicketNumber = await generateTicketNumber(connection);

    let ticketId: number;

    if (draftId) {
      // Validate draft exists
      const [draftRows]: any = await connection.query(
        `SELECT id, is_draft FROM tickets WHERE id = ? FOR UPDATE`,
        [draftId]
      );

      if (draftRows.length === 0) {
        throw Object.assign(new Error('Draft ticket not found'), { status: 404, code: 'DRAFT_NOT_FOUND' });
      }

      ticketId = draftId;

      await connection.query(
        `UPDATE tickets 
         SET ticket_number = ?,
             title = ?,
             description = ?,
             category = ?,
             priority = ?,
             department_id = ?,
             asset_id = ?,
             affected_person_id = ?,
             status = 'pending',
             is_draft = FALSE,
             updated_by_id = ?,
             idempotency_key = ?
         WHERE id = ?`,
        [
          officialTicketNumber,
          payload.title.trim(),
          payload.description.trim(),
          payload.category,
          payload.priority,
          payload.department_id,
          payload.asset_id || null,
          payload.affected_person_id || null,
          userId,
          payload.idempotency_key?.trim() || null,
          ticketId,
        ]
      );
    } else {
      // Direct insertion
      const [insertResult]: any = await connection.query(
        `INSERT INTO tickets (
           ticket_number, title, description, category, priority, status,
           department_id, asset_id, affected_person_id, created_by_id, updated_by_id,
           is_draft, draft_version, idempotency_key
         ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, FALSE, 1, ?)`,
        [
          officialTicketNumber,
          payload.title.trim(),
          payload.description.trim(),
          payload.category,
          payload.priority,
          payload.department_id,
          payload.asset_id || null,
          payload.affected_person_id || null,
          userId,
          userId,
          payload.idempotency_key?.trim() || null,
        ]
      );
      ticketId = insertResult.insertId;
    }

    // Append initial event into ticket_events timeline
    await connection.query(
      `INSERT INTO ticket_events (
         ticket_id, actor_id, event_type, previous_status, new_status, note
       ) VALUES (?, ?, 'created', NULL, 'pending', ?)`,
      [ticketId, userId, 'Ticket submitted and queued for ICT support.']
    );

    await connection.commit();
    connection.release();

    // Record audit log
    await recordAuditLog({
      actorId: userId,
      action: 'ticket_create',
      entityType: 'ticket',
      entityId: String(ticketId),
      details: {
        ticket_number: officialTicketNumber,
        title: payload.title,
        category: payload.category,
        priority: payload.priority,
        department_id: payload.department_id,
        ip_address: clientIp,
      },
    });

    return getTicketById(ticketId);
  } catch (error) {
    await connection.rollback();
    connection.release();
    throw error;
  }
}

/**
 * Checks for open tickets for the same computer or person within the same category.
 * Used for duplicate incident warning.
 */
export async function checkDuplicateTickets(params: {
  asset_id?: number;
  affected_person_id?: number;
  category?: string;
}): Promise<{ duplicateFound: boolean; duplicateTickets: any[] }> {
  const pool = getPool();
  const conditions: string[] = ["t.status IN ('pending', 'in_progress')", 't.is_draft = FALSE'];
  const queryParams: any[] = [];

  if (!params.asset_id && !params.affected_person_id) {
    return { duplicateFound: false, duplicateTickets: [] };
  }

  const entityConditions: string[] = [];
  if (params.asset_id) {
    entityConditions.push('t.asset_id = ?');
    queryParams.push(params.asset_id);
  }
  if (params.affected_person_id) {
    entityConditions.push('t.affected_person_id = ?');
    queryParams.push(params.affected_person_id);
  }

  conditions.push(`(${entityConditions.join(' OR ')})`);

  if (params.category && params.category !== 'other') {
    conditions.push('t.category = ?');
    queryParams.push(params.category);
  }

  const [rows]: any = await pool.query(
    `SELECT t.id, t.ticket_number, t.title, t.status, t.category, t.priority, t.created_at,
            a.hostname as asset_hostname, p.full_name as affected_person_name
     FROM tickets t
     LEFT JOIN assets a ON t.asset_id = a.id
     LEFT JOIN directory_people p ON t.affected_person_id = p.id
     WHERE ${conditions.join(' AND ')}
     ORDER BY t.created_at DESC
     LIMIT 5`,
    queryParams
  );

  return {
    duplicateFound: rows.length > 0,
    duplicateTickets: rows,
  };
}

/**
 * Advances ticket status and appends a timeline event inside a database transaction.
 * Never rewrites earlier progress updates.
 */
export async function transitionTicketStatus(
  ticketId: number,
  payload: StatusTransitionPayload,
  userId: number,
  clientIp?: string
): Promise<any> {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [rows]: any = await connection.query(
      `SELECT id, ticket_number, status, is_draft FROM tickets WHERE id = ? FOR UPDATE`,
      [ticketId]
    );

    if (rows.length === 0) {
      throw Object.assign(new Error('Ticket not found'), { status: 404, code: 'TICKET_NOT_FOUND' });
    }

    const currentTicket = rows[0];
    if (currentTicket.is_draft) {
      throw Object.assign(new Error('Cannot transition status of an unsubmitted draft'), {
        status: 400,
        code: 'INVALID_TICKET_STATE',
      });
    }

    const previousStatus = currentTicket.status;
    const targetStatus = payload.target_status;

    // Determine event_type
    let eventType: 'status_changed' | 'resolved' | 'reopened' | 'cancelled' = 'status_changed';
    let resolutionSummary = null;
    let resolvedAt = null;
    let resolvedById = null;

    if (targetStatus === 'resolved') {
      eventType = 'resolved';
      if (!payload.resolution_summary || payload.resolution_summary.trim().length < 5) {
        throw Object.assign(new Error('A resolution summary (minimum 5 characters) is required to resolve a ticket'), {
          status: 400,
          code: 'RESOLUTION_SUMMARY_REQUIRED',
        });
      }
      resolutionSummary = payload.resolution_summary.trim();
      resolvedAt = new Date();
      resolvedById = userId;
    } else if (targetStatus === 'cancelled') {
      eventType = 'cancelled';
    } else if ((previousStatus === 'resolved' || previousStatus === 'cancelled') && (targetStatus === 'in_progress' || targetStatus === 'pending')) {
      eventType = 'reopened';
    }

    // Update ticket
    if (targetStatus === 'resolved') {
      await connection.query(
        `UPDATE tickets 
         SET status = ?,
             resolution_summary = ?,
             resolved_at = ?,
             resolved_by_id = ?,
             updated_by_id = ?
         WHERE id = ?`,
        [targetStatus, resolutionSummary, resolvedAt, resolvedById, userId, ticketId]
      );
    } else if (eventType === 'reopened') {
      await connection.query(
        `UPDATE tickets 
         SET status = ?,
             resolved_at = NULL,
             resolved_by_id = NULL,
             updated_by_id = ?
         WHERE id = ?`,
        [targetStatus, userId, ticketId]
      );
    } else {
      await connection.query(
        `UPDATE tickets 
         SET status = ?,
             updated_by_id = ?
         WHERE id = ?`,
        [targetStatus, userId, ticketId]
      );
    }

    // Append to ticket_events timeline
    await connection.query(
      `INSERT INTO ticket_events (
         ticket_id, actor_id, event_type, previous_status, new_status, note
       ) VALUES (?, ?, ?, ?, ?, ?)`,
      [ticketId, userId, eventType, previousStatus, targetStatus, payload.note.trim()]
    );

    await connection.commit();
    connection.release();

    // Record audit log
    await recordAuditLog({
      actorId: userId,
      action: 'ticket_status_change',
      entityType: 'ticket',
      entityId: String(ticketId),
      details: {
        ticket_number: currentTicket.ticket_number,
        previous_status: previousStatus,
        new_status: targetStatus,
        note: payload.note,
        resolution_summary: resolutionSummary,
        ip_address: clientIp,
      },
    });

    return getTicketById(ticketId);
  } catch (error) {
    await connection.rollback();
    connection.release();
    throw error;
  }
}

/**
 * Appends an operational progress update / note to a ticket's timeline without changing status.
 */
export async function addTicketNote(
  ticketId: number,
  note: string,
  userId: number,
  clientIp?: string
): Promise<any> {
  const pool = getPool();

  const [ticketRows]: any = await pool.query(
    `SELECT id, ticket_number, status, is_draft FROM tickets WHERE id = ?`,
    [ticketId]
  );

  if (ticketRows.length === 0) {
    throw Object.assign(new Error('Ticket not found'), { status: 404, code: 'TICKET_NOT_FOUND' });
  }

  if (ticketRows[0].is_draft) {
    throw Object.assign(new Error('Cannot add timeline note to an unsubmitted draft'), {
      status: 400,
      code: 'INVALID_TICKET_STATE',
    });
  }

  // Insert event
  const [insertResult]: any = await pool.query(
    `INSERT INTO ticket_events (
       ticket_id, actor_id, event_type, previous_status, new_status, note
     ) VALUES (?, ?, 'note_added', ?, ?, ?)`,
    [ticketId, userId, ticketRows[0].status, ticketRows[0].status, note.trim()]
  );

  await pool.query(`UPDATE tickets SET updated_by_id = ? WHERE id = ?`, [userId, ticketId]);

  await recordAuditLog({
    actorId: userId,
    action: 'ticket_update',
    entityType: 'ticket',
    entityId: String(ticketId),
    details: {
      ticket_number: ticketRows[0].ticket_number,
      note_id: insertResult.insertId,
      note: note.slice(0, 100),
      ip_address: clientIp,
    },
  });

  return getTicketById(ticketId);
}

/**
 * Retrieves full ticket detail with joined entities and append-only timeline events.
 */
export async function getTicketById(ticketId: number): Promise<any | null> {
  const pool = getPool();

  const [rows]: any = await pool.query(
    `SELECT t.*, 
            d.name as department_name, d.code as department_code,
            a.hostname as asset_hostname, a.asset_tag, a.device_type,
            p.full_name as affected_person_name, p.staff_id as affected_staff_id,
            u_creator.full_name as creator_name, u_creator.role as creator_role,
            u_resolver.full_name as resolver_name
     FROM tickets t
     LEFT JOIN departments d ON t.department_id = d.id
     LEFT JOIN assets a ON t.asset_id = a.id
     LEFT JOIN directory_people p ON t.affected_person_id = p.id
     LEFT JOIN app_users u_creator ON t.created_by_id = u_creator.id
     LEFT JOIN app_users u_resolver ON t.resolved_by_id = u_resolver.id
     WHERE t.id = ?`,
    [ticketId]
  );

  if (rows.length === 0) return null;

  const ticket = rows[0];

  // Fetch all timeline events ordered chronologically
  const [events]: any = await pool.query(
    `SELECT e.id, e.ticket_id, e.actor_id, e.event_type, e.previous_status, e.new_status,
            e.note, e.created_at,
            u.full_name as actor_name, u.role as actor_role, u.username as actor_username
     FROM ticket_events e
     LEFT JOIN app_users u ON e.actor_id = u.id
     WHERE e.ticket_id = ?
     ORDER BY e.created_at ASC, e.id ASC`,
    [ticketId]
  );

  ticket.events = events;
  return ticket;
}
