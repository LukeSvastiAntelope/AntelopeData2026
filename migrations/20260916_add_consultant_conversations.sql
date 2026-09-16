-- Phase 2B: consultant chat-alongside state
CREATE TABLE IF NOT EXISTS consultant_conversations (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  organization_id BIGINT NULL,
  title VARCHAR(255) NULL,
  messages JSON NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_consultant_conv_user (user_id),
  INDEX idx_consultant_conv_org (organization_id),
  CONSTRAINT fk_consultant_conv_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS consultant_staged_actions (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  conversation_id BIGINT NOT NULL,
  tool_name VARCHAR(64) NOT NULL,
  summary TEXT NOT NULL,
  payload JSON NOT NULL,
  status ENUM('pending', 'approved', 'executed', 'dismissed') NOT NULL DEFAULT 'pending',
  result_summary TEXT NULL,
  result_data JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_staged_conv (conversation_id),
  INDEX idx_staged_status (status),
  CONSTRAINT fk_staged_conversation
    FOREIGN KEY (conversation_id) REFERENCES consultant_conversations(id) ON DELETE CASCADE
);
