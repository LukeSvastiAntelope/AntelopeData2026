-- G3 Field data (brief): append-only canvass_contacts + expanded status enum
-- turf_stop_outcomes remains the current-status rollup (latest contact per turf stop).

CREATE TABLE IF NOT EXISTS canvass_contacts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  voter_geo_id BIGINT UNSIGNED NOT NULL,
  person_record_id BIGINT UNSIGNED NULL,
  voter_file_id VARCHAR(100) NULL,
  turf_id BIGINT UNSIGNED NULL,
  canvasser_id INT NOT NULL,
  status ENUM(
    'not_home',
    'moved',
    'wrong_address',
    'supporter',
    'lean_support',
    'undecided',
    'lean_against',
    'refused',
    'dnc_request',
    -- legacy / UI-compatible dispositions also appendable
    'not_contacted',
    'contacted',
    'confirmed'
  ) NOT NULL,
  note TEXT NULL,
  party VARCHAR(64) NULL,
  survey_response_id INT NULL,
  recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_canvass_org (organization_id),
  KEY idx_canvass_geo (voter_geo_id),
  KEY idx_canvass_turf (turf_id),
  KEY idx_canvass_person (person_record_id),
  KEY idx_canvass_status (status),
  KEY idx_canvass_recorded (recorded_at),
  CONSTRAINT fk_canvass_voter_geo
    FOREIGN KEY (voter_geo_id) REFERENCES voter_geo (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_canvass_turf
    FOREIGN KEY (turf_id) REFERENCES turfs (id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Expand rollup enum to match brief statuses (keep legacy values)
ALTER TABLE turf_stop_outcomes
  MODIFY COLUMN status ENUM(
    'not_contacted',
    'contacted',
    'confirmed',
    'not_home',
    'refused',
    'moved',
    'wrong_address',
    'supporter',
    'lean_support',
    'undecided',
    'lean_against',
    'dnc_request'
  ) NOT NULL DEFAULT 'contacted';
