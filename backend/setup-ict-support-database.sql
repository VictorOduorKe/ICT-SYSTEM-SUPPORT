-- ICT Daily Support & Issue Tracking System
-- Run as a MySQL administrator (for example, root via sudo mysql).
-- Change the placeholder password before running.
-- This assumes the Express backend and MySQL run on the same server.

CREATE DATABASE IF NOT EXISTS ict_support
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'ict_app'@'localhost'
  IDENTIFIED BY 'REPLACE_WITH_A_STRONG_UNIQUE_PASSWORD';

-- Runtime privileges only: the application can work with records,
-- but cannot alter the database schema.
GRANT SELECT, INSERT, UPDATE, DELETE
  ON ict_support.*
  TO 'ict_app'@'localhost';

SHOW GRANTS FOR 'ict_app'@'localhost';
SHOW DATABASES LIKE 'ict_support';

-- NOTE:
-- Run schema migrations using a separate, temporary migration account
-- or an administrator account. Do not give the normal runtime account
-- CREATE, ALTER, DROP, or GRANT OPTION privileges in production.
