-- Admin A1: platform super-admin audit trail (cross-org reads + admin mutations).

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  actor_user_id INT UNSIGNED NOT NULL
    COMMENT 'users.id of the super-admin actor',
  action VARCHAR(64) NOT NULL
    COMMENT 'e.g. users.list, user.delete, survey.list, audit.list',
  target_type VARCHAR(64) NULL
    COMMENT 'user | survey | org | scheduler | audit | system',
  target_id VARCHAR(64) NULL,
  metadata JSON NULL,
  ip VARCHAR(64) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_admin_audit_actor_created (actor_user_id, created_at),
  KEY idx_admin_audit_action_created (action, created_at),
  KEY idx_admin_audit_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
