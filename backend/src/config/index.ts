import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// Load environment variables from backend/.env or root .env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default('127.0.0.1'),
  APP_BASE_URL: z.string().url().default('http://localhost:5173'),
  API_BASE_URL: z.string().default('http://localhost:4000/api/v1'),

  // Database Connection Pool
  DB_HOST: z.string().min(1, 'DB_HOST is required'),
  DB_PORT: z.coerce.number().int().positive().default(3306),
  DB_NAME: z.string().min(1, 'DB_NAME is required'),
  DB_USER: z.string().min(1, 'DB_USER is required'),
  DB_PASSWORD: z.string().default(''),
  DB_CONNECTION_LIMIT: z.coerce.number().int().positive().default(10),

  // Session & Security
  SESSION_SECRET: z.string().min(16, 'SESSION_SECRET must be at least 16 characters long'),
  SESSION_COOKIE_NAME: z.string().default('ict_session'),
  SESSION_MAX_AGE_MINUTES: z.coerce.number().int().positive().default(480),

  // File Uploads & Logging
  UPLOAD_MAX_MB: z.coerce.number().int().positive().default(10),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type AppConfig = z.infer<typeof envSchema>;

let parsedConfig: AppConfig;

try {
  parsedConfig = envSchema.parse(process.env);
} catch (error) {
  if (error instanceof z.ZodError) {
    const errorDetails = error.issues
      .map((issue) => ` - [${issue.path.join('.')}]: ${issue.message}`)
      .join('\n');
    console.error(`\x1b[31m[CONFIG FATAL] Environment configuration validation failed:\x1b[0m\n${errorDetails}`);
  } else {
    console.error('\x1b[31m[CONFIG FATAL] Unknown error during environment validation:\x1b[0m', error);
  }
  process.exit(1);
}

export const config = parsedConfig;
