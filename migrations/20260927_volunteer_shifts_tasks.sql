-- Volunteer V3: shifts, tasks, claims + reminder staging log.
-- A shift may optionally bind to a MiniVAN turf (canvass walk).

CREATE TABLE IF NOT EXISTS volunteer_shifts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  starts_at TIMESTAMP NOT NULL,
  ends_at TIMESTAMP NULL,
  location_text VARCHAR(500) NULL,
  turf_id BIGINT UNSIGNED NULL
    COMMENT 'Optional MiniVAN turf bind',
  capacity INT UNSIGNED NULL,
  status ENUM('open', 'full', 'cancelled', 'completed') NOT NULL DEFAULT 'open',
  reminder_hours_before INT NOT NULL DEFAULT 24,
  reminder_staged_at TIMESTAMP NULL,
  checkin_prompt_staged_at TIMESTAMP NULL,
  created_by BIGINT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_vol_shifts_org_starts (organization_id, starts_at),
  KEY idx_vol_shifts_org_status (organization_id, status),
  KEY idx_vol_shifts_turf (turf_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS volunteer_tasks (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  due_at TIMESTAMP NULL,
  shift_id BIGINT UNSIGNED NULL,
  status ENUM('open', 'cancelled', 'completed') NOT NULL DEFAULT 'open',
  created_by BIGINT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_vol_tasks_org (organization_id, status),
  KEY idx_vol_tasks_shift (shift_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS volunteer_shift_claims (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  shift_id BIGINT UNSIGNED NOT NULL,
  organization_id INT NOT NULL,
  user_id BIGINT NOT NULL,
  person_record_id BIGINT UNSIGNED NULL,
  status ENUM('claimed', 'checked_in', 'no_show', 'cancelled') NOT NULL DEFAULT 'claimed',
  claimed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  checked_in_at TIMESTAMP NULL,
  cancelled_at TIMESTAMP NULL,
  UNIQUE KEY uq_vol_shift_user (shift_id, user_id),
  KEY idx_vol_claims_org_user (organization_id, user_id),
  KEY idx_vol_claims_shift_status (shift_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS volunteer_task_claims (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  task_id BIGINT UNSIGNED NOT NULL,
  organization_id INT NOT NULL,
  user_id BIGINT NOT NULL,
  person_record_id BIGINT UNSIGNED NULL,
  status ENUM('claimed', 'done', 'cancelled') NOT NULL DEFAULT 'claimed',
  claimed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL,
  cancelled_at TIMESTAMP NULL,
  UNIQUE KEY uq_vol_task_user (task_id, user_id),
  KEY idx_vol_task_claims_org_user (organization_id, user_id),
  KEY idx_vol_task_claims_task (task_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS volunteer_reminder_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  kind ENUM('pre_shift', 'post_shift_checkin') NOT NULL,
  shift_id BIGINT UNSIGNED NOT NULL,
  staged_action_id BIGINT NULL,
  recipient_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_vol_reminder_shift (shift_id, kind),
  KEY idx_vol_reminder_org (organization_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
