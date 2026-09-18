-- Phase H1: agentic loop governor config (additive, never blocking)
CREATE TABLE IF NOT EXISTS loop_config (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  -- 0 = no organization / personal scope (avoids NULL uniqueness quirks)
  organization_id BIGINT NOT NULL DEFAULT 0,
  autonomy ENUM('manual', 'propose', 'auto_within_limits') NOT NULL DEFAULT 'propose',
  memory_json JSON NOT NULL,
  triggers_json JSON NOT NULL,
  budgets_json JSON NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_loop_user_org (user_id, organization_id),
  INDEX idx_loop_org (organization_id),
  CONSTRAINT fk_loop_config_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
