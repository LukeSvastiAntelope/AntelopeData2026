-- Volunteer V4: private friends-and-family contacts + relational outreach.
-- Contacts are owned by the volunteer and NEVER merged into the org voter file.
-- Event stream seeds the engagement ladder (V5) and retention (V6).

CREATE TABLE IF NOT EXISTS volunteer_private_contacts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  owner_user_id BIGINT NOT NULL
    COMMENT 'Volunteer who owns this private contact',
  display_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NULL,
  phone VARCHAR(64) NULL,
  relationship_note VARCHAR(255) NULL
    COMMENT 'e.g. mom, college roommate — private to volunteer',
  notes TEXT NULL,
  source ENUM('manual', 'device_import') NOT NULL DEFAULT 'manual',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_vol_priv_owner (organization_id, owner_user_id),
  KEY idx_vol_priv_email (organization_id, owner_user_id, email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS volunteer_relational_outreach (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  owner_user_id BIGINT NOT NULL,
  contact_id BIGINT UNSIGNED NOT NULL,
  channel ENUM('sms', 'email', 'in_person', 'call') NOT NULL DEFAULT 'sms',
  script_text TEXT NOT NULL,
  script_generated_at TIMESTAMP NULL,
  status ENUM(
    'draft',
    'ready',
    'staged',
    'logged',
    'skipped'
  ) NOT NULL DEFAULT 'draft',
  outcome ENUM(
    'reached',
    'left_message',
    'no_answer',
    'not_interested',
    'will_help',
    'wants_to_volunteer',
    'other'
  ) NULL,
  outcome_note VARCHAR(500) NULL,
  outcome_logged_at TIMESTAMP NULL,
  staged_action_id BIGINT NULL
    COMMENT 'Gated outbound staged card id when send was requested',
  converted_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_vol_outreach_owner (organization_id, owner_user_id, status),
  KEY idx_vol_outreach_contact (contact_id),
  KEY idx_vol_outreach_outcome (organization_id, outcome)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Org-scoped volunteer event stream (event-sourced; no per-person scoring).
CREATE TABLE IF NOT EXISTS volunteer_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  user_id BIGINT NOT NULL,
  kind VARCHAR(64) NOT NULL
    COMMENT 'contact_added | outreach_logged | contact_converted | shift_checked_in | task_completed | shoutout | …',
  points INT NOT NULL DEFAULT 0
    COMMENT 'Tasteful points for meaningful actions; 0 for non-point events',
  related_type VARCHAR(32) NULL,
  related_id BIGINT UNSIGNED NULL,
  payload JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_vol_events_user (organization_id, user_id, created_at),
  KEY idx_vol_events_kind (organization_id, kind, created_at),
  KEY idx_vol_events_org_created (organization_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
