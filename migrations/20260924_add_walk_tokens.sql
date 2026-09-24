-- MiniVAN M2: scoped, revocable, expiring walk tokens for canvasser PWA.
-- Raw token is never stored — only sha256 hex. Token authorizes exactly one turf.

CREATE TABLE IF NOT EXISTS walk_tokens (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  turf_id BIGINT UNSIGNED NOT NULL,
  canvasser_user_id INT NOT NULL,
  token_hash CHAR(64) NOT NULL,
  label VARCHAR(128) NULL,
  expires_at TIMESTAMP NOT NULL,
  revoked_at TIMESTAMP NULL,
  created_by INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at TIMESTAMP NULL,
  UNIQUE KEY uq_walk_token_hash (token_hash),
  KEY idx_walk_org (organization_id),
  KEY idx_walk_turf (turf_id),
  KEY idx_walk_canvasser (canvasser_user_id),
  KEY idx_walk_expires (expires_at),
  CONSTRAINT fk_walk_token_turf
    FOREIGN KEY (turf_id) REFERENCES turfs (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
