-- ============================================================
-- Migration 002: Import Staging Data & Duplicate Policy
-- ICT Daily Support & Issue Tracking System
-- ============================================================

ALTER TABLE import_jobs 
ADD COLUMN staged_data JSON NULL AFTER errors,
ADD COLUMN duplicate_policy ENUM('skip', 'update') NOT NULL DEFAULT 'skip' AFTER staged_data;
