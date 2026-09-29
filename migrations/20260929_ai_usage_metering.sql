-- AI G3: usage metering + per-org credit allowances
-- Soft-limit first; hard enforcement is an env flag (off by default).

ALTER TABLE organizations
  ADD COLUMN ai_plan_tier ENUM('grassroots', 'campaign', 'congressional')
    NOT NULL DEFAULT 'grassroots'
    COMMENT 'AI credit plan: Grassroots / Campaign / Congressional'
    AFTER election_year;

ALTER TABLE organizations
  ADD COLUMN ai_credit_allowance_override INT NULL DEFAULT NULL
    COMMENT 'Optional monthly credit override; NULL = use plan default'
    AFTER ai_plan_tier;

CREATE TABLE IF NOT EXISTS ai_usage_events (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NULL,
  user_id BIGINT NULL,
  feature VARCHAR(64) NOT NULL DEFAULT 'general',
  tier VARCHAR(32) NOT NULL,
  model VARCHAR(128) NOT NULL,
  input_tokens INT NOT NULL DEFAULT 0,
  output_tokens INT NOT NULL DEFAULT 0,
  credits DECIMAL(12, 4) NOT NULL DEFAULT 0,
  cost_usd DECIMAL(12, 6) NOT NULL DEFAULT 0,
  used_fallback TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_ai_usage_org_created (organization_id, created_at),
  KEY idx_ai_usage_created (created_at),
  KEY idx_ai_usage_feature (feature),
  CONSTRAINT fk_ai_usage_org
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed plan tier from office_type where possible
UPDATE organizations
SET ai_plan_tier = CASE
  WHEN office_type IN ('federal_house', 'federal_senate', 'president') THEN 'congressional'
  WHEN office_type IN ('governor', 'state_senate', 'state_house') THEN 'campaign'
  ELSE 'grassroots'
END
WHERE ai_plan_tier = 'grassroots';
