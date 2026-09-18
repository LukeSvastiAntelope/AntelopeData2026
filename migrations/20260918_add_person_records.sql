-- D1: Unified person records + address points (serving store for map/collation)
-- Matching/entity resolution runs offline (scripts/collation); MySQL only stores results.
-- No person-level financial/banking fields (GLBA).

CREATE TABLE IF NOT EXISTS address_points (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NULL,
  street_normalized VARCHAR(255) NOT NULL,
  unit VARCHAR(64) NULL,
  city VARCHAR(128) NULL,
  state CHAR(2) NULL,
  zip VARCHAR(10) NULL,
  latitude DECIMAL(10, 7) NULL,
  longitude DECIMAL(10, 7) NULL,
  geocode_confidence DECIMAL(4, 3) NULL DEFAULT NULL,
  source_address VARCHAR(512) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_address_org_norm (organization_id, street_normalized, unit, zip),
  KEY idx_address_org (organization_id),
  KEY idx_address_zip (zip),
  KEY idx_address_lat_lng (latitude, longitude)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS person_records (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NULL,
  cluster_key VARCHAR(64) NOT NULL,
  address_point_id BIGINT UNSIGNED NULL,
  first_name VARCHAR(128) NULL,
  last_name VARCHAR(128) NULL,
  full_name_normalized VARCHAR(255) NULL,
  email VARCHAR(255) NULL,
  phone VARCHAR(32) NULL,
  birthdate DATE NULL,
  age_years SMALLINT UNSIGNED NULL,
  age_bucket VARCHAR(16) NULL,
  party VARCHAR(64) NULL,
  gender VARCHAR(32) NULL,
  voter_status VARCHAR(64) NULL,
  district VARCHAR(64) NULL,
  city VARCHAR(128) NULL,
  state CHAR(2) NULL,
  zip VARCHAR(10) NULL,
  owner_occupied TINYINT(1) NULL,
  property_type VARCHAR(64) NULL,
  match_confidence DECIMAL(4, 3) NOT NULL DEFAULT 0.000,
  field_provenance JSON NULL,
  source_row_ids JSON NULL,
  latitude DECIMAL(10, 7) NULL,
  longitude DECIMAL(10, 7) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_person_org_cluster (organization_id, cluster_key),
  KEY idx_person_org (organization_id),
  KEY idx_person_address (address_point_id),
  KEY idx_person_zip (zip),
  KEY idx_person_party (party),
  KEY idx_person_district (district),
  KEY idx_person_age_bucket (age_bucket),
  KEY idx_person_voter_status (voter_status),
  KEY idx_person_lat_lng (latitude, longitude),
  KEY idx_person_confidence (match_confidence),
  CONSTRAINT fk_person_address_point
    FOREIGN KEY (address_point_id) REFERENCES address_points (id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Raw/standardized source rows retained for incremental matching + audit
CREATE TABLE IF NOT EXISTS person_source_rows (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NULL,
  source_name VARCHAR(128) NOT NULL,
  source_row_key VARCHAR(128) NOT NULL,
  person_record_id BIGINT UNSIGNED NULL,
  payload JSON NOT NULL,
  block_key VARCHAR(128) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_source_org_key (organization_id, source_name, source_row_key),
  KEY idx_source_person (person_record_id),
  KEY idx_source_block (organization_id, block_key),
  CONSTRAINT fk_source_person
    FOREIGN KEY (person_record_id) REFERENCES person_records (id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
