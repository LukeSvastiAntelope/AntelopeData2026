-- Admin A4: time-boxed, audited support impersonation ("view as" campaign).

CREATE TABLE IF NOT EXISTS admin_support_sessions (
  id CHAR(36) NOT NULL PRIMARY KEY
    COMMENT 'UUID; also the httpOnly cookie value',
  actor_user_id INT UNSIGNED NOT NULL
    COMMENT 'super-admin users.id',
  actor_email VARCHAR(255) NOT NULL,
  target_organization_id INT UNSIGNED NOT NULL,
  target_organization_name VARCHAR(255) NULL,
  mode ENUM('read', 'write') NOT NULL DEFAULT 'read'
    COMMENT 'read = view-only; write requires explicit opt-in and is always audited',
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  ended_at TIMESTAMP NULL DEFAULT NULL,
  end_reason VARCHAR(32) NULL
    COMMENT 'manual | expired | replaced | revoked',
  duration_seconds INT UNSIGNED NULL
    COMMENT 'set on end: wall-clock seconds active',
  metadata JSON NULL,
  KEY idx_support_actor_active (actor_user_id, ended_at, expires_at),
  KEY idx_support_org (target_organization_id),
  KEY idx_support_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
