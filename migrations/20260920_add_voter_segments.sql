-- MT1: Named voter segments — live filter definitions (not frozen voter lists).
-- Definition JSON maps to D2 map/collation + VT2/VT3 tracked-attribute filters.
-- Membership is always recomputed on resolve.

CREATE TABLE IF NOT EXISTS voter_segments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  slug VARCHAR(96) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  -- Live filter: gender, minAgeYears, ownerOccupied, tracked[], hasDonated, …
  definition JSON NOT NULL,
  created_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_voter_segment_org_slug (organization_id, slug),
  KEY idx_voter_segment_org (organization_id),
  KEY idx_voter_segment_name (organization_id, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
