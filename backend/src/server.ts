import { createApp } from './app.js';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import { testConnection, closePool } from './db/pool.js';

async function bootstrap() {
  logger.info({ environment: config.NODE_ENV }, 'Starting ICT Support System Backend...');

  // Test Database connectivity on boot
  const dbHealth = await testConnection();
  if (dbHealth.healthy) {
    logger.info({ latencyMs: dbHealth.latencyMs }, 'Successfully verified MySQL database connection');
  } else {
    logger.warn({ error: dbHealth.error }, 'Warning: MySQL database ping failed on startup. Will retry on demand.');
  }

  const app = createApp();

  const server = app.listen(config.PORT, config.HOST, () => {
    logger.info(
      {
        host: config.HOST,
        port: config.PORT,
        baseUrl: config.API_BASE_URL,
      },
      `ICT Support Server is listening at http://${config.HOST}:${config.PORT}`
    );
  });

  // Graceful shutdown handling
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Received termination signal, shutting down gracefully...');
    server.close(async () => {
      logger.info('HTTP server closed');
      await closePool();
      logger.info('Database pool closed. Exiting process.');
      process.exit(0);
    });

    // Force shutdown after 10s timeout
    setTimeout(() => {
      logger.error('Graceful shutdown timed out after 10s. Forcing exit.');
      process.exit(1);
    }, 10000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  logger.fatal({ err }, 'Fatal error during application startup');
  process.exit(1);
});
