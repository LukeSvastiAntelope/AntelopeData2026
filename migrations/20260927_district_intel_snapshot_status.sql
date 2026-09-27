-- Data D2: snapshot status for async onboarding generation ("gathering…").

ALTER TABLE district_intel_snapshots
  ADD COLUMN status ENUM('pending', 'ready', 'failed') NOT NULL DEFAULT 'ready'
    COMMENT 'Async job status — pending while external APIs run'
    AFTER sources_health;

ALTER TABLE district_intel_snapshots
  ADD COLUMN error_message VARCHAR(500) NULL
    AFTER status;
