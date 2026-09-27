-- Volunteer V5: light gamification — teams, shoutouts.
-- Points + ladder status derive from volunteer_events (V4 event stream).

CREATE TABLE IF NOT EXISTS volunteer_teams (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  name VARCHAR(120) NOT NULL,
  description VARCHAR(500) NULL,
  created_by BIGINT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_vol_team_org_name (organization_id, name),
  KEY idx_vol_teams_org (organization_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS volunteer_team_members (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  team_id BIGINT UNSIGNED NOT NULL,
  organization_id INT NOT NULL,
  user_id BIGINT NOT NULL,
  joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_vol_team_user (team_id, user_id),
  KEY idx_vol_team_member_user (organization_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS volunteer_shoutouts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  from_user_id BIGINT NOT NULL
    COMMENT 'Staff who shouts out',
  to_user_id BIGINT NOT NULL
    COMMENT 'Volunteer receiving shoutout',
  message VARCHAR(280) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_vol_shoutout_to (organization_id, to_user_id, created_at),
  KEY idx_vol_shoutout_org (organization_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
