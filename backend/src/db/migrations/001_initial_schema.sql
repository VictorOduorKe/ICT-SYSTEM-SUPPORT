-- ============================================================
-- Migration 001: Initial Relational Schema
-- ICT Daily Support & Issue Tracking System
-- ============================================================

-- 1. Application Users (Strictly 3 roles: ict_officer, supervisor, administrator)
CREATE TABLE IF NOT EXISTS app_users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    role ENUM('ict_officer', 'supervisor', 'administrator') NOT NULL DEFAULT 'ict_officer',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_users_role (role),
    INDEX idx_users_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Departments
CREATE TABLE IF NOT EXISTS departments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL UNIQUE,
    code VARCHAR(30) NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_departments_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Staff / User Directory (People affected by issues; NOT login accounts)
CREATE TABLE IF NOT EXISTS directory_people (
    id INT AUTO_INCREMENT PRIMARY KEY,
    staff_id VARCHAR(50) NOT NULL UNIQUE,
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(150) NULL,
    phone VARCHAR(50) NULL,
    department_id INT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_people_dept FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
    INDEX idx_people_name (full_name),
    INDEX idx_people_dept (department_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Computer / Asset Inventory
CREATE TABLE IF NOT EXISTS assets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    hostname VARCHAR(100) NOT NULL UNIQUE,
    asset_tag VARCHAR(100) NULL UNIQUE,
    device_type VARCHAR(60) NOT NULL DEFAULT 'Desktop',
    department_id INT NULL,
    assigned_person_id INT NULL,
    location VARCHAR(120) NULL,
    operating_system VARCHAR(100) NULL,
    ip_address VARCHAR(45) NULL,
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    notes TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_assets_dept FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
    CONSTRAINT fk_assets_person FOREIGN KEY (assigned_person_id) REFERENCES directory_people(id) ON DELETE SET NULL,
    INDEX idx_assets_type (device_type),
    INDEX idx_assets_dept (department_id),
    INDEX idx_assets_archived (is_archived)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Support Tickets
CREATE TABLE IF NOT EXISTS tickets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ticket_number VARCHAR(30) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    category ENUM('hardware', 'network', 'printer', 'software', 'access', 'security', 'maintenance', 'other') NOT NULL DEFAULT 'other',
    priority ENUM('low', 'normal', 'high', 'critical') NOT NULL DEFAULT 'normal',
    status ENUM('pending', 'in_progress', 'resolved', 'cancelled') NOT NULL DEFAULT 'pending',
    department_id INT NULL,
    asset_id INT NULL,
    affected_person_id INT NULL,
    created_by_id INT NOT NULL,
    updated_by_id INT NULL,
    resolved_by_id INT NULL,
    resolved_at TIMESTAMP NULL,
    resolution_summary TEXT NULL,
    is_draft BOOLEAN NOT NULL DEFAULT FALSE,
    draft_version INT NOT NULL DEFAULT 1,
    idempotency_key VARCHAR(64) NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_tickets_dept FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE RESTRICT,
    CONSTRAINT fk_tickets_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE SET NULL,
    CONSTRAINT fk_tickets_person FOREIGN KEY (affected_person_id) REFERENCES directory_people(id) ON DELETE SET NULL,
    CONSTRAINT fk_tickets_creator FOREIGN KEY (created_by_id) REFERENCES app_users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_tickets_updater FOREIGN KEY (updated_by_id) REFERENCES app_users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_tickets_resolver FOREIGN KEY (resolved_by_id) REFERENCES app_users(id) ON DELETE RESTRICT,
    INDEX idx_tickets_status (status),
    INDEX idx_tickets_category (category),
    INDEX idx_tickets_priority (priority),
    INDEX idx_tickets_created_at (created_at),
    INDEX idx_tickets_draft (is_draft)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Ticket Events (Append-only audit timeline of updates & transitions)
CREATE TABLE IF NOT EXISTS ticket_events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ticket_id INT NOT NULL,
    actor_id INT NOT NULL,
    event_type ENUM('created', 'draft_saved', 'status_changed', 'note_added', 'resolved', 'reopened', 'cancelled') NOT NULL,
    previous_status VARCHAR(30) NULL,
    new_status VARCHAR(30) NULL,
    note TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_events_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
    CONSTRAINT fk_events_actor FOREIGN KEY (actor_id) REFERENCES app_users(id) ON DELETE RESTRICT,
    INDEX idx_events_ticket (ticket_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Routine Maintenance Records
CREATE TABLE IF NOT EXISTS maintenance_records (
    id INT AUTO_INCREMENT PRIMARY KEY,
    maintenance_date DATE NOT NULL,
    asset_id INT NULL,
    department_id INT NOT NULL,
    maintenance_type VARCHAR(100) NOT NULL,
    work_performed TEXT NOT NULL,
    result VARCHAR(100) NOT NULL DEFAULT 'Completed',
    officer_id INT NOT NULL,
    notes TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_maint_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE SET NULL,
    CONSTRAINT fk_maint_dept FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE RESTRICT,
    CONSTRAINT fk_maint_officer FOREIGN KEY (officer_id) REFERENCES app_users(id) ON DELETE RESTRICT,
    INDEX idx_maint_date (maintenance_date),
    INDEX idx_maint_dept (department_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    actor_id INT NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(60) NOT NULL,
    entity_id VARCHAR(60) NULL,
    ip_address VARCHAR(45) NULL,
    user_agent VARCHAR(255) NULL,
    details JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_audit_actor FOREIGN KEY (actor_id) REFERENCES app_users(id) ON DELETE SET NULL,
    INDEX idx_audit_created (created_at),
    INDEX idx_audit_action (action),
    INDEX idx_audit_entity (entity_type, entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. Stateful Sessions
CREATE TABLE IF NOT EXISTS sessions (
    session_id VARCHAR(128) PRIMARY KEY,
    user_id INT NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    data JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE,
    INDEX idx_sessions_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. Bulk Import Jobs
CREATE TABLE IF NOT EXISTS import_jobs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    file_name VARCHAR(255) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    status ENUM('previewing', 'committed', 'failed') NOT NULL DEFAULT 'previewing',
    total_rows INT NOT NULL DEFAULT 0,
    created_count INT NOT NULL DEFAULT 0,
    updated_count INT NOT NULL DEFAULT 0,
    skipped_count INT NOT NULL DEFAULT 0,
    failed_count INT NOT NULL DEFAULT 0,
    imported_by_id INT NOT NULL,
    errors JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL,
    CONSTRAINT fk_imports_actor FOREIGN KEY (imported_by_id) REFERENCES app_users(id) ON DELETE RESTRICT,
    INDEX idx_imports_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 11. System Settings
CREATE TABLE IF NOT EXISTS system_settings (
    setting_key VARCHAR(100) PRIMARY KEY,
    setting_value TEXT NOT NULL,
    description VARCHAR(255) NULL,
    updated_by_id INT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_settings_updater FOREIGN KEY (updated_by_id) REFERENCES app_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
