-- Campaign workflow progress (Phase 1 — additive, never blocking)
CREATE TABLE IF NOT EXISTS user_workflow_progress (
  user_id BIGINT NOT NULL PRIMARY KEY,
  current_stage VARCHAR(32) NOT NULL DEFAULT 'plan',
  completed_stages JSON NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_workflow_progress_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
