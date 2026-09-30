-- Distribution W1: campaign Zapier/Make webhook destinations for approved content.
-- Fires only after human approval (wired in a later phase). URLs stored encrypted.

CREATE TABLE IF NOT EXISTS distribution_webhooks (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  label VARCHAR(128) NOT NULL,
  url_encrypted TEXT NOT NULL
    COMMENT 'AES-encrypted Catch Hook URL (never return plaintext after save)',
  secret VARCHAR(64) NOT NULL
    COMMENT 'HMAC-SHA256 signing secret for X-Antelope-Signature',
  content_types JSON NOT NULL
    COMMENT 'JSON array of content types, e.g. ["video","text"]',
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  last_success_at TIMESTAMP NULL DEFAULT NULL,
  last_failure_at TIMESTAMP NULL DEFAULT NULL,
  KEY idx_dist_wh_org (organization_id),
  KEY idx_dist_wh_org_enabled (organization_id, enabled),
  CONSTRAINT fk_dist_wh_org
    FOREIGN KEY (organization_id) REFERENCES organizations(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
