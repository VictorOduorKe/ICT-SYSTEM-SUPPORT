import { Request } from 'express';
import { getPool } from '../../db/pool.js';
import { logger } from '../../utils/logger.js';

export interface AuditLogOptions {
  actorId?: number | null;
  action: string;
  entityType: string;
  entityId?: string | number | null;
  details?: Record<string, any> | null;
  req?: Request;
}

export async function recordAuditLog(options: AuditLogOptions): Promise<void> {
  const { actorId = null, action, entityType, entityId = null, details = null, req } = options;

  let ipAddress: string | null = null;
  let userAgent: string | null = null;

  if (req) {
    ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket?.remoteAddress || null;
    userAgent = req.headers['user-agent'] || null;
  }

  try {
    const pool = getPool();
    await pool.query(
      `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, ip_address, user_agent, details)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        actorId,
        action,
        entityType,
        entityId ? String(entityId) : null,
        ipAddress,
        userAgent ? userAgent.substring(0, 255) : null,
        details ? JSON.stringify(details) : null,
      ]
    );
  } catch (err) {
    logger.error({ err, action, entityType }, 'Failed to record audit log entry');
  }
}
