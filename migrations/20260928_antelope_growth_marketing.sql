-- Admin A5: Antelope-owned social channel + gated agentic marketing drafts.
-- Platform-level only — never tied to a candidate/campaign organization.

CREATE TABLE IF NOT EXISTS antelope_growth_channels (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  provider ENUM('twitter') NOT NULL DEFAULT 'twitter',
  handle VARCHAR(64) NOT NULL DEFAULT 'antelopeHQ',
  display_name VARCHAR(128) NULL,
  status ENUM('draft', 'connected', 'paused', 'revoked') NOT NULL DEFAULT 'draft',
  encrypted_credentials JSON NULL
    COMMENT 'Optional X API creds; posting stays stubbed without them',
  settings JSON NULL
    COMMENT 'e.g. { scheduleCron, autoDraftEnabled, tone, topics[] }',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_antelope_growth_provider (provider)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS antelope_marketing_drafts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  channel_id INT UNSIGNED NOT NULL,
  provider ENUM('twitter') NOT NULL DEFAULT 'twitter',
  status ENUM(
    'draft',
    'pending_approval',
    'approved',
    'rejected',
    'posted',
    'cancelled'
  ) NOT NULL DEFAULT 'draft',
  body VARCHAR(560) NOT NULL
    COMMENT 'Post body (X-length friendly)',
  topic VARCHAR(255) NULL,
  tone VARCHAR(64) NULL,
  source ENUM('manual', 'agent', 'scheduler') NOT NULL DEFAULT 'agent',
  staged_action_id INT NULL
    COMMENT 'Optional link to consultant_staged_actions',
  scheduled_for TIMESTAMP NULL DEFAULT NULL,
  approved_at TIMESTAMP NULL DEFAULT NULL,
  approved_by INT UNSIGNED NULL,
  rejected_at TIMESTAMP NULL DEFAULT NULL,
  rejected_by INT UNSIGNED NULL,
  posted_at TIMESTAMP NULL DEFAULT NULL,
  post_external_id VARCHAR(128) NULL,
  metadata JSON NULL,
  created_by INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_amd_status_created (status, created_at),
  KEY idx_amd_channel (channel_id),
  KEY idx_amd_scheduled (scheduled_for),
  CONSTRAINT fk_amd_channel
    FOREIGN KEY (channel_id) REFERENCES antelope_growth_channels(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed the Antelope X channel (paused until Luke connects / enables drafting)
INSERT INTO antelope_growth_channels (provider, handle, display_name, status, settings)
VALUES (
  'twitter',
  'antelopeHQ',
  'Antelope',
  'connected',
  JSON_OBJECT(
    'autoDraftEnabled', true,
    'tone', 'plainspoken civic-tech',
    'topics', JSON_ARRAY(
      'downballot tools',
      'listen-analyze-act loop',
      'transparent pricing',
      'district intelligence'
    ),
    'scheduleHint', 'Weekday mornings — drafts only, never auto-post'
  )
)
ON DUPLICATE KEY UPDATE handle = VALUES(handle);
