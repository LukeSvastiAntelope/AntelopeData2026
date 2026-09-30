-- Distribution W4: platform-scoped Zapier/Make destinations for Antelope own-growth.
-- Fully separate from campaign distribution_webhooks (no organization_id).

CREATE TABLE IF NOT EXISTS platform_distribution_webhooks (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  label VARCHAR(128) NOT NULL,
  url_encrypted TEXT NOT NULL
    COMMENT 'AES-encrypted Catch Hook URL (masked after save)',
  secret VARCHAR(64) NOT NULL
    COMMENT 'HMAC-SHA256 signing secret',
  content_types JSON NOT NULL
    COMMENT 'Typically ["text"] for X growth posts',
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  last_success_at TIMESTAMP NULL DEFAULT NULL,
  last_failure_at TIMESTAMP NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS platform_distribution_deliveries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  marketing_draft_id BIGINT UNSIGNED NULL,
  staged_action_id INT NULL,
  webhook_id INT UNSIGNED NOT NULL,
  status ENUM('pending', 'success', 'failed', 'exhausted') NOT NULL DEFAULT 'pending',
  http_status INT NULL,
  attempt INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  next_attempt_at TIMESTAMP NULL DEFAULT NULL,
  error TEXT NULL,
  payload_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_pdd_due (status, next_attempt_at),
  KEY idx_pdd_draft (marketing_draft_id),
  KEY idx_pdd_staged (staged_action_id),
  KEY idx_pdd_webhook (webhook_id),
  CONSTRAINT fk_pdd_webhook
    FOREIGN KEY (webhook_id) REFERENCES platform_distribution_webhooks(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
