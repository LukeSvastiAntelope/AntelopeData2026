-- ============================================================
-- BASE SCHEMA — AntelopeCM
-- Contains ONLY the original tables as they existed before
-- any migration ran. Migrations in the numbered files are
-- responsible for all subsequent column/table additions.
-- ============================================================

-- ── Core user table ─────────────────────────────────────────
-- email, display_name, is_first_login added by 20250127_email_migration.sql
-- last_news_seen_at added by 20260212_add_last_news_seen_at_to_users.sql
CREATE TABLE IF NOT EXISTS users (
  id             BIGINT AUTO_INCREMENT PRIMARY KEY,
  telegram_id    VARCHAR(255) NULL,
  username       VARCHAR(255) UNIQUE NULL,
  password       VARCHAR(255) NOT NULL DEFAULT '',
  wallet_balance DECIMAL(20,8) DEFAULT 0,
  total_winnings DECIMAL(20,8) DEFAULT 0,
  escrow_balance DECIMAL(20,8) DEFAULT 0,
  is_verified    TINYINT DEFAULT 0,
  role           ENUM('user','admin') DEFAULT 'user',
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_username (username)
);

-- ── Agent profiles ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agents (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  user_id          BIGINT NOT NULL,
  name             VARCHAR(255) DEFAULT 'My Agent',
  description      TEXT,
  image            VARCHAR(500),
  interests        TEXT,
  riskLevel        VARCHAR(50),
  principles       TEXT,
  maxTimelineLimit INT DEFAULT 30,
  category         VARCHAR(100) DEFAULT 'General',
  model            VARCHAR(100) DEFAULT 'gpt-4o',
  plugins          TEXT,
  wallet_balance   DECIMAL(20,8) DEFAULT 0,
  escrow_balance   DECIMAL(20,8) DEFAULT 0,
  nft_address      VARCHAR(255),
  ipfs_hash        VARCHAR(500),
  trainCount       INT DEFAULT 30,
  train_index      TEXT,
  is_onboarded     TINYINT DEFAULT 0,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id)
);

-- ── External platform accounts (Telegram etc.) ──────────────
CREATE TABLE IF NOT EXISTS platform_accounts (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  platform_id    VARCHAR(255) NOT NULL,
  user_id        BIGINT NULL,
  username       VARCHAR(255),
  platform       VARCHAR(50) NOT NULL,
  wallet_balance DECIMAL(20,8) DEFAULT 0,
  escrow_balance DECIMAL(20,8) DEFAULT 0,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_user_id (user_id),
  INDEX idx_platform (platform, platform_id)
);

-- ── Payment intents ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_intents (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  payment_id     VARCHAR(255) UNIQUE NOT NULL,
  user_id        BIGINT NOT NULL,
  agent_id       INT NOT NULL,
  amount         DECIMAL(20,8) DEFAULT 0,
  credit_amount  DECIMAL(20,8) DEFAULT 0,
  payment_method VARCHAR(50),
  from_address   VARCHAR(255),
  status         VARCHAR(50) DEFAULT 'pending',
  expires_at     TIMESTAMP NULL,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_payment_id (payment_id),
  INDEX idx_user_id (user_id)
);

-- ── Action log ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS actions (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     BIGINT NOT NULL,
  description TEXT,
  type        VARCHAR(50),
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_id (user_id)
);

-- ── Legacy agent conversation messages ───────────────────────
CREATE TABLE IF NOT EXISTS conversations (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    BIGINT NOT NULL,
  agent_id   INT NOT NULL,
  message    TEXT,
  type       VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_id (user_id),
  INDEX idx_agent_id (agent_id)
);

-- ── Surveys ──────────────────────────────────────────────────
-- All additional columns (anonymity_level, demographics_required,
-- parent_survey_id, source, start_at/end_at, campaign_*, stopped_*,
-- demographic_config, is_template, clone_count, etc.) are added by migrations.
-- Original status enum was ('draft','published','closed').
CREATE TABLE IF NOT EXISTS surveys (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  title       VARCHAR(255) NOT NULL,
  description TEXT,
  slug        VARCHAR(255) UNIQUE NOT NULL,
  created_by  BIGINT NOT NULL,
  is_public   BOOLEAN DEFAULT TRUE,
  status      ENUM('draft','published','closed') DEFAULT 'draft',
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_slug (slug),
  INDEX idx_created_by (created_by),
  INDEX idx_status (status)
);

-- ── Survey questions ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS survey_questions (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  survey_id      INT NOT NULL,
  type           ENUM('text','single-choice','multiple-choice','rating','yes-no','email','number') NOT NULL,
  prompt         TEXT NOT NULL,
  options        JSON NULL,
  media          JSON NULL,
  option_media   JSON NULL,
  is_required    BOOLEAN DEFAULT FALSE,
  question_order INT NOT NULL,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE,
  INDEX idx_survey_id (survey_id),
  INDEX idx_order (survey_id, question_order)
);

-- ── Survey responses ─────────────────────────────────────────
-- source, agent_token added by 20250122_add_survey_source_tracking.sql
-- anonymity_level added by 20250125_add_survey_anonymity_system_v2.sql
-- age_range/gender/etc generated columns added by 20240614_add_demographic_columns.sql
-- age/location/occupation/etc regular columns added by 20250128_normalize_demographic_fields.sql
-- enrichment_source added by 20250208_add_voter_file_enrichment.sql
CREATE TABLE IF NOT EXISTS survey_responses (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  survey_id    INT NOT NULL,
  responder_id BIGINT NULL,
  demographics JSON,
  ip_address   VARCHAR(45),
  user_agent   TEXT,
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE,
  FOREIGN KEY (responder_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_survey_id (survey_id),
  INDEX idx_submitted_at (submitted_at),
  INDEX idx_ip_address (ip_address)
);

-- ── Survey answers ───────────────────────────────────────────
-- answer_code added by 20240714_add_answer_code_to_survey_answers.sql
CREATE TABLE IF NOT EXISTS survey_answers (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  response_id  INT NOT NULL,
  question_id  INT NOT NULL,
  answer_value TEXT,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (response_id) REFERENCES survey_responses(id) ON DELETE CASCADE,
  FOREIGN KEY (question_id) REFERENCES survey_questions(id) ON DELETE CASCADE,
  UNIQUE KEY unique_response_question (response_id, question_id),
  INDEX idx_response_id (response_id),
  INDEX idx_question_id (question_id)
);

-- ── Digital twins ────────────────────────────────────────────
-- completion_percentage, demographic_category added by 20250125_add_survey_anonymity_system_v2.sql
-- persona_profile, capability_map added by 20250811_add_twin_persona_capabilities.sql
-- email added by 20250122_add_survey_source_tracking.sql
-- voter_file_id added by 20250208_add_voter_file_enrichment.sql
CREATE TABLE IF NOT EXISTS responder_agents (
  id                       INT AUTO_INCREMENT PRIMARY KEY,
  base_profile             JSON NOT NULL,
  enrichment_status        ENUM('pending','processing','completed','failed') DEFAULT 'pending',
  created_from_response_id INT NOT NULL,
  agent_token              VARCHAR(255) UNIQUE,
  created_at               TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at               TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  last_queried_at          TIMESTAMP NULL,
  query_count              INT DEFAULT 0,
  FOREIGN KEY (created_from_response_id) REFERENCES survey_responses(id) ON DELETE CASCADE,
  INDEX idx_response_id (created_from_response_id),
  INDEX idx_token (agent_token),
  INDEX idx_enrichment_status (enrichment_status)
);

-- ── Agent query log ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_queries (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  responder_agent_id INT NOT NULL,
  query_text         TEXT NOT NULL,
  response_text      TEXT,
  queried_by         BIGINT NULL,
  response_time_ms   INT,
  created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (responder_agent_id) REFERENCES responder_agents(id) ON DELETE CASCADE,
  FOREIGN KEY (queried_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_agent_id (responder_agent_id),
  INDEX idx_queried_by (queried_by),
  INDEX idx_created_at (created_at)
);
