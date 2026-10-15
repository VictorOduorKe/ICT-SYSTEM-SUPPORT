import crypto from 'crypto';
import { getPool } from '../../db/pool.js';
import { config } from '../../config/index.js';
import { AuthUser, SessionRecord } from './auth.types.js';

export async function createSession(userId: number, data: any = {}): Promise<SessionRecord> {
  const sessionId = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + config.SESSION_MAX_AGE_MINUTES * 60 * 1000);

  const pool = getPool();
  await pool.query(
    `INSERT INTO sessions (session_id, user_id, expires_at, data)
     VALUES (?, ?, ?, ?)`,
    [sessionId, userId, expiresAt, JSON.stringify(data)]
  );

  return {
    session_id: sessionId,
    user_id: userId,
    expires_at: expiresAt.toISOString(),
    data,
    created_at: new Date().toISOString(),
  };
}

export async function getSession(sessionId: string): Promise<{ session: SessionRecord; user: AuthUser } | null> {
  if (!sessionId) return null;

  const pool = getPool();
  const [rows] = await pool.query<any[]>(
    `SELECT 
        s.session_id,
        s.user_id,
        s.expires_at,
        s.data,
        s.created_at as session_created_at,
        u.id as user_id,
        u.username,
        u.full_name,
        u.role,
        u.is_active,
        u.created_at as user_created_at
     FROM sessions s
     INNER JOIN app_users u ON s.user_id = u.id
     WHERE s.session_id = ? AND s.expires_at > UTC_TIMESTAMP()`,
    [sessionId]
  );

  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }

  const row = rows[0];

  const user: AuthUser = {
    id: row.user_id,
    username: row.username,
    full_name: row.full_name,
    role: row.role,
    is_active: Boolean(row.is_active),
    created_at: row.user_created_at,
  };

  const session: SessionRecord = {
    session_id: row.session_id,
    user_id: row.user_id,
    expires_at: row.expires_at,
    data: typeof row.data === 'string' ? JSON.parse(row.data) : row.data,
    created_at: row.session_created_at,
    user,
  };

  return { session, user };
}

export async function destroySession(sessionId: string): Promise<boolean> {
  if (!sessionId) return false;
  const pool = getPool();
  const [result]: any = await pool.query('DELETE FROM sessions WHERE session_id = ?', [sessionId]);
  return result && result.affectedRows > 0;
}

export async function cleanExpiredSessions(): Promise<number> {
  const pool = getPool();
  const [result]: any = await pool.query('DELETE FROM sessions WHERE expires_at <= UTC_TIMESTAMP()');
  return result?.affectedRows || 0;
}
