-- G2 Turf cutting: contact_suppression + saved turfs + filter columns on voter_geo
-- Layered eligibility: base filter ∩ include − exclude − DNC − (optional) already-contacted

ALTER TABLE voter_geo
  ADD COLUMN party VARCHAR(64) NULL AFTER zip,
  ADD COLUMN partisan_score DECIMAL(6, 2) NULL AFTER party,
  ADD COLUMN turnout_score DECIMAL(6, 2) NULL AFTER partisan_score,
  ADD KEY idx_voter_geo_party (party);

CREATE TABLE IF NOT EXISTS contact_suppression (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  -- At least one of these keys should be set (address / voter / person / agent)
  voter_geo_id BIGINT UNSIGNED NULL,
  voter_file_id VARCHAR(100) NULL,
  person_record_id BIGINT UNSIGNED NULL,
  responder_agent_id INT NULL,
  reason VARCHAR(255) NOT NULL DEFAULT 'do_not_contact',
  source ENUM('manual', 'mailchimp', 'refused', 'import', 'sms_stop', 'other') NOT NULL DEFAULT 'manual',
  notes VARCHAR(512) NULL,
  created_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_suppress_org (organization_id),
  KEY idx_suppress_geo (voter_geo_id),
  KEY idx_suppress_voter_file (organization_id, voter_file_id),
  KEY idx_suppress_person (person_record_id),
  KEY idx_suppress_agent (responder_agent_id),
  CONSTRAINT fk_suppress_voter_geo
    FOREIGN KEY (voter_geo_id) REFERENCES voter_geo (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS turfs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  label VARCHAR(128) NOT NULL,
  -- Resolved walk-list definition (fences, filters, suppression flags)
  definition JSON NOT NULL,
  assigned_to INT NULL,
  address_count INT NOT NULL DEFAULT 0,
  notes VARCHAR(512) NULL,
  created_by INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_turf_org_label (organization_id, label),
  KEY idx_turf_org (organization_id),
  KEY idx_turf_assigned (assigned_to)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Materialized ordered walk-list snapshot at build time
CREATE TABLE IF NOT EXISTS turf_addresses (
  turf_id BIGINT UNSIGNED NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  voter_geo_id BIGINT UNSIGNED NOT NULL,
  voter_file_id VARCHAR(100) NULL,
  person_record_id BIGINT UNSIGNED NULL,
  street VARCHAR(255) NULL,
  city VARCHAR(128) NULL,
  state CHAR(2) NULL,
  zip VARCHAR(10) NULL,
  latitude DECIMAL(10, 7) NULL,
  longitude DECIMAL(10, 7) NULL,
  party VARCHAR(64) NULL,
  label VARCHAR(512) NULL,
  PRIMARY KEY (turf_id, voter_geo_id),
  KEY idx_turf_addr_order (turf_id, sort_order),
  CONSTRAINT fk_turf_addr_turf
    FOREIGN KEY (turf_id) REFERENCES turfs (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_turf_addr_geo
    FOREIGN KEY (voter_geo_id) REFERENCES voter_geo (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
