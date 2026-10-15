import mysql, { Pool, PoolConnection } from 'mysql2/promise';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    logger.info(
      {
        host: config.DB_HOST,
        port: config.DB_PORT,
        database: config.DB_NAME,
        user: config.DB_USER,
        connectionLimit: config.DB_CONNECTION_LIMIT,
      },
      'Initializing MySQL connection pool'
    );

    pool = mysql.createPool({
      host: config.DB_HOST,
      port: config.DB_PORT,
      user: config.DB_USER,
      password: config.DB_PASSWORD,
      database: config.DB_NAME,
      waitForConnections: true,
      connectionLimit: config.DB_CONNECTION_LIMIT,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
      timezone: '+00:00', // Enforce UTC storage
      dateStrings: true,
    });
  }

  return pool;
}

export async function testConnection(): Promise<{ healthy: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    const currentPool = getPool();
    const [rows] = await currentPool.query('SELECT 1 as ping');
    const latencyMs = Date.now() - start;
    if (Array.isArray(rows) && rows.length > 0) {
      return { healthy: true, latencyMs };
    }
    return { healthy: false, latencyMs, error: 'Empty ping response' };
  } catch (err: unknown) {
    const latencyMs = Date.now() - start;
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error({ err, latencyMs }, 'Database health check failed');
    return { healthy: false, latencyMs, error: errorMsg };
  }
}

export async function query<T = any>(sql: string, params?: any[]): Promise<T> {
  const currentPool = getPool();
  const [results] = await currentPool.execute(sql, params);
  return results as T;
}

export async function withTransaction<T>(
  callback: (connection: PoolConnection) => Promise<T>
): Promise<T> {
  const currentPool = getPool();
  const connection = await currentPool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    logger.info('Closing MySQL connection pool');
    await pool.end();
    pool = null;
  }
}
