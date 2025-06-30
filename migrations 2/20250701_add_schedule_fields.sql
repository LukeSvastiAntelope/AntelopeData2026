-- --------------------------------------------------
-- Migration: 20250701_add_schedule_fields.sql
-- Purpose  : Add scheduling columns (start_at, end_at, archived_at)
--            and extend the surveys.status enum for lifecycle control.
--            Also add an index on end_at to accelerate expiry queries.
-- --------------------------------------------------

START TRANSACTION;

-- 1. Extend the status enum to include planned lifecycle states
ALTER TABLE surveys
  MODIFY COLUMN status ENUM('draft', 'scheduled', 'active', 'closed', 'archived')
  DEFAULT 'draft';

-- 2. Add scheduling & archival timestamps
ALTER TABLE surveys
  ADD COLUMN start_at TIMESTAMP NULL AFTER updated_at,
  ADD COLUMN end_at   TIMESTAMP NULL AFTER start_at,
  ADD COLUMN archived_at TIMESTAMP NULL AFTER status;

-- 3. Useful index for the automatic close cron job
ALTER TABLE surveys
  ADD INDEX idx_end_at (end_at);

COMMIT;

-- --------------------------------------------------
-- Rollback (if needed)
-- --------------------------------------------------
-- START TRANSACTION;
-- ALTER TABLE surveys
--   DROP INDEX idx_end_at,
--   DROP COLUMN start_at,
--   DROP COLUMN end_at,
--   DROP COLUMN archived_at,
--   MODIFY COLUMN status ENUM('draft', 'published', 'closed') DEFAULT 'draft';
-- COMMIT; 