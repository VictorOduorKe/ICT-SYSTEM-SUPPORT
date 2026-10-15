import bcrypt from 'bcrypt';
import { fileURLToPath } from 'url';
import { getPool, closePool } from '../pool.js';
import { logger } from '../../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);

export async function runSeeds() {
  const pool = getPool();
  logger.info('Starting database seeding...');

  // 1. Seed Departments
  const departments = [
    { name: 'ICT & Infrastructure', code: 'ICT' },
    { name: 'Administration & Executive', code: 'ADM' },
    { name: 'Finance & Accounts', code: 'FIN' },
    { name: 'Human Resources', code: 'HR' },
    { name: 'Operations & Logistics', code: 'OPS' },
    { name: 'Customer Support', code: 'CS' },
  ];

  for (const dept of departments) {
    await pool.query(
      `INSERT INTO departments (name, code, is_active)
       VALUES (?, ?, TRUE)
       ON DUPLICATE KEY UPDATE name = VALUES(name), is_active = TRUE`,
      [dept.name, dept.code]
    );
  }
  logger.info({ count: departments.length }, 'Seeded initial departments');

  // 2. Seed Default Application Users (3 Roles Only)
  const saltRounds = 10;
  const adminHash = await bcrypt.hash('Admin123!@#', saltRounds);
  const supervisorHash = await bcrypt.hash('Supervisor123!@#', saltRounds);
  const officerHash = await bcrypt.hash('Officer123!@#', saltRounds);

  const initialUsers = [
    {
      username: 'admin',
      password_hash: adminHash,
      full_name: 'ICT System Administrator',
      role: 'administrator',
    },
    {
      username: 'supervisor',
      password_hash: supervisorHash,
      full_name: 'Operations Supervisor',
      role: 'supervisor',
    },
    {
      username: 'ictofficer',
      password_hash: officerHash,
      full_name: 'Lead ICT Officer',
      role: 'ict_officer',
    },
  ];

  for (const u of initialUsers) {
    await pool.query(
      `INSERT INTO app_users (username, password_hash, full_name, role, is_active)
       VALUES (?, ?, ?, ?, TRUE)
       ON DUPLICATE KEY UPDATE
         password_hash = VALUES(password_hash),
         full_name = VALUES(full_name),
         role = VALUES(role),
         is_active = TRUE`,
      [u.username, u.password_hash, u.full_name, u.role]
    );
  }
  logger.info({ count: initialUsers.length }, 'Seeded initial role accounts (admin, supervisor, ictofficer)');

  // 3. Seed System Settings
  const defaultSettings = [
    { key: 'organization_name', value: 'ICT Department Operations', desc: 'Organization display title' },
    { key: 'ticket_prefix', value: 'ICT', desc: 'Prefix for generated ticket reference numbers' },
    { key: 'daily_report_cutoff_hour', value: '17', desc: 'Hour of day (24h) for daily reporting cut-off' },
  ];

  for (const s of defaultSettings) {
    await pool.query(
      `INSERT INTO system_settings (setting_key, setting_value, description)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), description = VALUES(description)`,
      [s.key, s.value, s.desc]
    );
  }
  logger.info({ count: defaultSettings.length }, 'Seeded default system settings');

  logger.info('Database seeding completed successfully');
}

// Allow direct CLI execution
if (process.argv[1] === __filename) {
  runSeeds()
    .then(async () => {
      await closePool();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('Seeding failed:', err);
      await closePool();
      process.exit(1);
    });
}
