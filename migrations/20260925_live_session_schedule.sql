-- Live L7: schedule support for session management dashboard
ALTER TABLE live_sessions
  MODIFY COLUMN status ENUM('draft', 'scheduled', 'live', 'ended')
    NOT NULL DEFAULT 'draft';

ALTER TABLE live_sessions
  ADD COLUMN scheduled_at TIMESTAMP NULL DEFAULT NULL AFTER ended_at;

CREATE INDEX idx_live_sessions_scheduled
  ON live_sessions (organization_id, status, scheduled_at);
