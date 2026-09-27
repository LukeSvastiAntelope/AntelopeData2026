-- Volunteer V1: two-tier access — extend org roles + magic-link identity spine.
-- Staff remain owner/admin/analyst/viewer; volunteers get role='volunteer'.
-- 'captain' is reserved for a future tier (no portal view in v1).

ALTER TABLE organization_members
  MODIFY COLUMN role ENUM(
    'owner',
    'admin',
    'analyst',
    'viewer',
    'volunteer',
    'captain'
  ) NOT NULL DEFAULT 'viewer';

-- Link volunteer membership to a person_record (org-scoped identity + history).
ALTER TABLE organization_members
  ADD COLUMN person_record_id BIGINT UNSIGNED NULL
    COMMENT 'Volunteer identity → person_records (org-scoped)'
    AFTER user_id;

CREATE INDEX idx_org_members_person
  ON organization_members (organization_id, person_record_id);

-- Passwordless invite tokens. Raw token never stored — sha256 hex only.
CREATE TABLE IF NOT EXISTS volunteer_magic_links (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  email VARCHAR(255) NOT NULL,
  display_name VARCHAR(255) NULL,
  token_hash CHAR(64) NOT NULL,
  invited_by BIGINT NULL,
  person_record_id BIGINT UNSIGNED NULL,
  expires_at TIMESTAMP NOT NULL,
  consumed_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_volunteer_magic_token (token_hash),
  KEY idx_volunteer_magic_org_email (organization_id, email),
  KEY idx_volunteer_magic_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
