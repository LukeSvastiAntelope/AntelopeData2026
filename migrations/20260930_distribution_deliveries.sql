-- Distribution W2: per-destination delivery log + retry scheduling for approved content.

CREATE TABLE IF NOT EXISTS distribution_deliveries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  staged_action_id INT NOT NULL,
  webhook_id INT UNSIGNED NOT NULL,
  organization_id INT NOT NULL,
  status ENUM('pending', 'success', 'failed', 'exhausted') NOT NULL DEFAULT 'pending',
  http_status INT NULL,
  attempt INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  next_attempt_at TIMESTAMP NULL DEFAULT NULL,
  error TEXT NULL,
  payload_json JSON NULL
    COMMENT 'Snapshot of content.approved payload for retries',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_dd_due (status, next_attempt_at),
  KEY idx_dd_staged (staged_action_id),
  KEY idx_dd_webhook (webhook_id),
  KEY idx_dd_org (organization_id),
  CONSTRAINT fk_dd_webhook
    FOREIGN KEY (webhook_id) REFERENCES distribution_webhooks(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
