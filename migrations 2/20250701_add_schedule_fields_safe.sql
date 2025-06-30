-- --------------------------------------------------
-- Migration: 20250701_add_schedule_fields_safe.sql
-- Purpose  : Add scheduling columns (start_at, end_at, archived_at)
--            and extend the surveys.status enum for lifecycle control.
--            Also migrates existing 'published' surveys to 'active'.
-- --------------------------------------------------

START TRANSACTION;

-- 1. First, add the new columns (safe - they're nullable)
ALTER TABLE surveys
  ADD COLUMN start_at TIMESTAMP NULL AFTER updated_at,
  ADD COLUMN end_at   TIMESTAMP NULL AFTER start_at,
  ADD COLUMN archived_at TIMESTAMP NULL AFTER status;

-- 2. Add index for performance
ALTER TABLE surveys
  ADD INDEX idx_end_at (end_at);

-- 3. Extend the status enum (keeping all existing values)
ALTER TABLE surveys
  MODIFY COLUMN status ENUM('draft', 'scheduled', 'active', 'published', 'closed', 'archived')
  DEFAULT 'draft';

-- 4. Migrate existing 'published' surveys to 'active' 
UPDATE surveys 
SET status = 'active' 
WHERE status = 'published';

-- 5. Now remove 'published' from the enum (optional - can keep for backwards compatibility)
-- ALTER TABLE surveys
--   MODIFY COLUMN status ENUM('draft', 'scheduled', 'active', 'closed', 'archived')
--   DEFAULT 'draft';

COMMIT;

-- --------------------------------------------------
-- Verification query (run after migration):
-- SELECT status, COUNT(*) FROM surveys GROUP BY status;
-- -------------------------------------------------- 