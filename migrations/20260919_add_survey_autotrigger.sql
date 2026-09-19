-- AT1: Per-survey auto-trigger config + event log.
-- When response count crosses threshold, fire analytics → find_postable_insight once.
-- Matching/generation stay in existing tools; this table only stores the setting + fire state.

CREATE TABLE IF NOT EXISTS survey_autotrigger (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  survey_id INT NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  -- Response count that must be crossed to fire (default 20 per brief)
  threshold INT NOT NULL DEFAULT 20,
  -- Intended outputs: analytics | newsletter | video (AT1 fires analytics→insight;
  -- newsletter/video generation is AT2)
  actions JSON NOT NULL,
  -- propose = stage for approval (AT3); auto = agent owns end-to-end (AT3).
  -- AT1 fires the analytics chain for both (tools are risk:auto).
  autonomy ENUM('propose', 'auto') NOT NULL DEFAULT 'propose',
  last_fired_at TIMESTAMP NULL,
  -- Response count recorded at last successful claim (idempotency)
  last_fired_response_count INT NOT NULL DEFAULT 0,
  fired_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_autotrigger_survey (survey_id),
  KEY idx_autotrigger_enabled (enabled, last_fired_at),
  CONSTRAINT fk_autotrigger_survey
    FOREIGN KEY (survey_id) REFERENCES surveys (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS survey_autotrigger_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  survey_id INT NOT NULL,
  organization_id INT NULL,
  event_type VARCHAR(64) NOT NULL,
  response_count INT NOT NULL,
  threshold INT NOT NULL,
  band INT NOT NULL DEFAULT 1,
  actions JSON NULL,
  autonomy VARCHAR(32) NULL,
  result JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_at_events_survey (survey_id, created_at),
  KEY idx_at_events_type (event_type, created_at),
  KEY idx_at_events_org (organization_id, created_at),
  CONSTRAINT fk_at_events_survey
    FOREIGN KEY (survey_id) REFERENCES surveys (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
