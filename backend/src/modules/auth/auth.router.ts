import { Router, Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import rateLimit from 'express-rate-limit';
import { getPool } from '../../db/pool.js';
import { config } from '../../config/index.js';
import { createSession, destroySession } from './session.service.js';
import { recordAuditLog } from '../audit/audit.service.js';
import { requireAuth } from '../../middleware/auth.js';
import { AuthUser } from './auth.types.js';

export const authRouter = Router();

// Rate limiter for login to prevent brute force
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 login attempts per 15 min per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'TOO_MANY_LOGIN_ATTEMPTS',
      message: 'Too many login attempts. Please wait 15 minutes before trying again.',
    },
  },
});

const loginSchema = z.object({
  username: z.string().min(1, 'Username is required').trim(),
  password: z.string().min(1, 'Password is required'),
});

// POST /api/v1/auth/login
authRouter.post('/login', loginLimiter, async (req: Request, res: Response) => {
  const parseResult = loginSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid login payload',
        details: parseResult.error.format(),
      },
    });
  }

  const { username, password } = parseResult.data;
  const pool = getPool();

  const [rows] = await pool.query<any[]>(
    'SELECT id, username, password_hash, full_name, role, is_active FROM app_users WHERE username = ?',
    [username]
  );

  if (!Array.isArray(rows) || rows.length === 0) {
    await recordAuditLog({
      action: 'AUTH_LOGIN_FAILED',
      entityType: 'app_users',
      details: { username, reason: 'USER_NOT_FOUND' },
      req,
    });

    return res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid username or password.',
      },
    });
  }

  const userRow = rows[0];

  // Verify password hash
  const isMatch = await bcrypt.compare(password, userRow.password_hash);
  if (!isMatch) {
    await recordAuditLog({
      actorId: userRow.id,
      action: 'AUTH_LOGIN_FAILED',
      entityType: 'app_users',
      entityId: userRow.id,
      details: { username, reason: 'PASSWORD_MISMATCH' },
      req,
    });

    return res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid username or password.',
      },
    });
  }

  // Check if account is active
  if (!userRow.is_active) {
    await recordAuditLog({
      actorId: userRow.id,
      action: 'AUTH_LOGIN_REJECTED',
      entityType: 'app_users',
      entityId: userRow.id,
      details: { username, reason: 'ACCOUNT_INACTIVE' },
      req,
    });

    return res.status(403).json({
      success: false,
      error: {
        code: 'ACCOUNT_DEACTIVATED',
        message: 'Your account has been deactivated. Please contact an Administrator.',
      },
    });
  }

  // Create active session in database
  const session = await createSession(userRow.id, {
    ip: req.socket?.remoteAddress,
    userAgent: req.headers['user-agent'],
  });

  // Set secure HTTP-only cookie
  res.cookie(config.SESSION_COOKIE_NAME, session.session_id, {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: config.SESSION_MAX_AGE_MINUTES * 60 * 1000,
    path: '/',
  });

  const authUser: AuthUser = {
    id: userRow.id,
    username: userRow.username,
    full_name: userRow.full_name,
    role: userRow.role,
    is_active: Boolean(userRow.is_active),
  };

  await recordAuditLog({
    actorId: userRow.id,
    action: 'AUTH_LOGIN_SUCCESS',
    entityType: 'app_users',
    entityId: userRow.id,
    details: { role: userRow.role },
    req,
  });

  return res.json({
    success: true,
    data: {
      user: authUser,
      token: session.session_id, // Also returned for optional header-based LAN clients
    },
  });
});

// POST /api/v1/auth/logout
authRouter.post('/logout', async (req: Request, res: Response) => {
  const sessionId =
    req.sessionId ||
    req.cookies?.[config.SESSION_COOKIE_NAME] ||
    (req.headers['x-session-token'] as string) ||
    null;

  if (sessionId) {
    await destroySession(sessionId);
  }

  if (req.user) {
    await recordAuditLog({
      actorId: req.user.id,
      action: 'AUTH_LOGOUT',
      entityType: 'app_users',
      entityId: req.user.id,
      req,
    });
  }

  res.clearCookie(config.SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });

  return res.json({
    success: true,
    message: 'Logged out successfully',
  });
});

// GET /api/v1/auth/me
authRouter.get('/me', requireAuth, (req: Request, res: Response) => {
  return res.json({
    success: true,
    data: {
      user: req.user,
    },
  });
});
