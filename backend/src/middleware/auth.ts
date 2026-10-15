import { Request, Response, NextFunction } from 'express';
import { config } from '../config/index.js';
import { getSession } from '../modules/auth/session.service.js';
import { UserRole } from '../modules/auth/auth.types.js';

export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const sessionId =
    req.cookies?.[config.SESSION_COOKIE_NAME] ||
    req.signedCookies?.[config.SESSION_COOKIE_NAME] ||
    (req.headers['x-session-token'] as string) ||
    null;

  if (!sessionId) {
    return next();
  }

  try {
    const sessionResult = await getSession(sessionId);
    if (sessionResult && sessionResult.user) {
      req.user = sessionResult.user;
      req.sessionId = sessionResult.session.session_id;
    }
  } catch (err) {
    // Session lookup failure should safely fall through to unauthenticated
  }

  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required. Please log in to proceed.',
      },
    });
  }

  if (!req.user.is_active) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'ACCOUNT_DEACTIVATED',
        message: 'Your account has been deactivated. Contact an Administrator.',
      },
    });
  }

  next();
}

export function requireRole(allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required.',
        },
      });
    }

    if (!req.user.is_active) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'ACCOUNT_DEACTIVATED',
          message: 'Your account has been deactivated.',
        },
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `Access denied. Requires one of roles: [${allowedRoles.join(', ')}]`,
        },
      });
    }

    next();
  };
}
