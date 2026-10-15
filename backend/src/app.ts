import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import { testConnection, getPool } from './db/pool.js';
import { authenticate, requireRole } from './middleware/auth.js';
import { authRouter } from './modules/auth/auth.router.js';
import { departmentRouter } from './modules/departments/department.router.js';
import { directoryRouter } from './modules/directory/directory.router.js';
import { inventoryRouter } from './modules/inventory/inventory.router.js';
import { ticketRouter } from './modules/tickets/ticket.router.js';
import { maintenanceRouter } from './modules/maintenance/maintenance.router.js';
import { reportsRouter } from './modules/reports/reports.router.js';
import { importRouter } from './modules/imports/import.router.js';

export function createApp() {
  const app = express();

  // 1. Security Headers via Helmet
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'", config.APP_BASE_URL],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    })
  );

  // 2. Strict CORS Configuration
  const allowedOrigins = [
    config.APP_BASE_URL,
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ];

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (like curl, test tools, server-to-server)
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error(`Origin ${origin} not allowed by CORS`));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-CSRF-Token', 'x-session-token'],
    })
  );

  // 3. Body Parsing & Cookies
  app.use(express.json({ limit: `${config.UPLOAD_MAX_MB}mb` }));
  app.use(express.urlencoded({ extended: true, limit: `${config.UPLOAD_MAX_MB}mb` }));
  app.use(cookieParser(config.SESSION_SECRET));

  // 4. Session Authentication Middleware (Global resolution)
  app.use(authenticate);

  // 5. Rate Limiting for General API Routes
  const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      error: {
        code: 'TOO_MANY_REQUESTS',
        message: 'Too many requests from this client, please try again later.',
      },
    },
  });
  app.use('/api/', globalLimiter);

  // 6. Health Check Endpoint (Safe: No secrets leaked)
  app.get('/api/health', async (_req: Request, res: Response) => {
    const dbCheck = await testConnection();
    const isHealthy = dbCheck.healthy;

    res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? 'healthy' : 'degraded',
      service: 'ict-support-backend',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      database: {
        connected: dbCheck.healthy,
        latencyMs: dbCheck.latencyMs,
      },
    });
  });

  // 7. Base API v1 Info
  app.get('/api/v1', (_req: Request, res: Response) => {
    res.json({
      name: 'ICT Daily Support & Issue Tracking API',
      version: 'v1',
      status: 'active',
      endpoints: {
        health: '/api/health',
        auth: '/api/v1/auth',
        tickets: '/api/v1/tickets',
        directory: '/api/v1/directory',
        inventory: '/api/v1/assets',
        maintenance: '/api/v1/maintenance',
        reports: '/api/v1/reports',
        imports: '/api/v1/imports',
        audit: '/api/v1/audit-logs',
      },
    });
  });

  // 8. Routers
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/departments', departmentRouter);
  app.use('/api/v1/directory', directoryRouter);
  app.use('/api/v1/assets', inventoryRouter);
  app.use('/api/v1/tickets', ticketRouter);
  app.use('/api/v1/maintenance', maintenanceRouter);
  app.use('/api/v1/reports', reportsRouter);
  app.use('/api/v1/imports', importRouter);

  // 9. Administrator-Only Audit Logs Endpoint
  app.get('/api/v1/audit-logs', requireRole(['administrator']), async (_req: Request, res: Response) => {
    const pool = getPool();
    const [rows] = await pool.query<any[]>(
      `SELECT a.id, a.actor_id, u.username as actor_username, a.action, a.entity_type, 
              a.entity_id, a.ip_address, a.details, a.created_at
       FROM audit_logs a
       LEFT JOIN app_users u ON a.actor_id = u.id
       ORDER BY a.created_at DESC
       LIMIT 100`
    );

    res.json({
      success: true,
      data: rows,
    });
  });

  // 10. 404 Handler for Undefined Routes
  app.use('/api/*', (req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Endpoint ${req.method} ${req.originalUrl} not found`,
      },
    });
  });

  // 11. Global Centralized Error Handler
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const statusCode = err.status || err.statusCode || 500;
    const isClientError = statusCode >= 400 && statusCode < 500;

    if (!isClientError) {
      logger.error({ err }, 'Unhandled server error');
    }

    res.status(statusCode).json({
      success: false,
      error: {
        code: err.code || (isClientError ? 'CLIENT_ERROR' : 'INTERNAL_SERVER_ERROR'),
        message: isClientError ? err.message : 'An internal server error occurred',
      },
    });
  });

  return app;
}
