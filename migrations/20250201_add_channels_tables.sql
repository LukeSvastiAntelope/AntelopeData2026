-- Migration: Add channels (user integrations, survey channel enablement, and sessions)
-- Notes:
--   - Scoped per user for now (no organizations yet). Designed to migrate to org later.
--   - Uses VARCHAR and JSON types compatible with MySQL 8.x.

-- user_channel_integrations: stores per-user provider credentials and settings
CREATE TABLE IF NOT EXISTS user_channel_integrations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  provider ENUM('telegram','discord','sms_twilio','whatsapp','email','web') NOT NULL,
  status ENUM('draft','connected','revoked','error') DEFAULT 'draft',
  encrypted_credentials JSON NULL,
  settings JSON NULL,
  webhook_secret VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_user_provider (user_id, provider)
);

-- survey_channels: per-survey channel enablement/config
CREATE TABLE IF NOT EXISTS survey_channels (
  id INT AUTO_INCREMENT PRIMARY KEY,
  survey_id INT NOT NULL,
  channel ENUM('telegram','discord','sms','whatsapp','email','web') NOT NULL,
  status ENUM('configured','enabled','paused') DEFAULT 'configured',
  config JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_survey_channel (survey_id, channel),
  INDEX idx_survey_channels_survey (survey_id)
);

-- survey_channel_sessions: conversational state per external user
CREATE TABLE IF NOT EXISTS survey_channel_sessions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  survey_id INT NOT NULL,
  channel ENUM('telegram','discord','sms','whatsapp') NOT NULL,
  external_user_id VARCHAR(255) NOT NULL, -- e.g., telegram chat_id
  username VARCHAR(255) NULL,
  state JSON NULL, -- { currentQuestionIndex, selections, lastMessageId, lastUpdateIdProcessed }
  is_completed TINYINT(1) DEFAULT 0,
  completed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_session (survey_id, channel, external_user_id),
  INDEX idx_sessions_survey (survey_id)
);

-- Optional: add source values for responses to include channels, if ENUM is used
-- Attempt to extend survey_responses.source if it exists and is ENUM
-- This block is safe to run; it checks metadata before altering
DELIMITER $$
CREATE PROCEDURE IF NOT EXISTS maybe_extend_response_source()
BEGIN
  DECLARE col_type TEXT;
  SELECT COLUMN_TYPE INTO col_type
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'survey_responses'
    AND COLUMN_NAME = 'source';

  IF col_type IS NOT NULL AND col_type LIKE 'enum(%' THEN
    -- Extend enum to include channel sources if not already present
    SET @ddl = CONCAT(
      'ALTER TABLE survey_responses MODIFY COLUMN source ENUM(',
      "'native','import','web','email','telegram','discord','sms','whatsapp'",
      ') DEFAULT ''native'''
    );
    PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  END IF;
END $$
DELIMITER ;

CALL maybe_extend_response_source();


