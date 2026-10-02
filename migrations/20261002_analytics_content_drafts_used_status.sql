-- H4: draft lifecycle — used terminal state so Campaign Flow "Next: Spread" clears
ALTER TABLE analytics_content_drafts
  MODIFY COLUMN status ENUM('ready', 'opened', 'staged', 'used', 'dismissed')
  NOT NULL DEFAULT 'ready';
