import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations() {
  logger.info('Starting database migration runner...');

  // Use a connection with multipleStatements enabled specifically for migration execution
  const connection = await mysql.createConnection({
    host: config.DB_HOST,
    port: config.DB_PORT,
    user: config.DB_USER,
    password: config.DB_PASSWORD,
    database: config.DB_NAME,
    multipleStatements: true,
  });

  try {
    // Ensure schema_migrations table exists
    await connection.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        version VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Fetch already applied migrations
    const [rows] = await connection.query<any[]>('SELECT version FROM schema_migrations ORDER BY id ASC');
    const applied = new Set((rows as any[]).map((r) => r.version));

    // Read migration files in directory
    const files = fs
      .readdirSync(__dirname)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    let appliedCount = 0;

    for (const file of files) {
      if (applied.has(file)) {
        logger.debug({ file }, 'Migration already applied, skipping');
        continue;
      }

      logger.info({ file }, `Applying migration: ${file}`);
      const filePath = path.join(__dirname, file);
      const sqlContent = fs.readFileSync(filePath, 'utf-8');

      await connection.beginTransaction();
      try {
        await connection.query(sqlContent);
        await connection.query('INSERT INTO schema_migrations (version) VALUES (?)', [file]);
        await connection.commit();
        logger.info({ file }, `Successfully applied migration: ${file}`);
        appliedCount++;
      } catch (err) {
        await connection.rollback();
        logger.error({ file, err }, `Migration execution failed: ${file}`);
        throw err;
      }
    }

    logger.info({ appliedCount }, 'Database migrations completed successfully');
  } finally {
    await connection.end();
  }
}

// Allow direct CLI execution
if (process.argv[1] === __filename) {
  runMigrations()
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
