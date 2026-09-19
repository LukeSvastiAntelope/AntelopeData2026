-- G3 Field data: per-stop outcomes on a saved turf walk-list
-- assigned_to already on turfs (G2); outcomes make the walk usable in the field.

CREATE TABLE IF NOT EXISTS turf_stop_outcomes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  turf_id BIGINT UNSIGNED NOT NULL,
  voter_geo_id BIGINT UNSIGNED NOT NULL,
  person_record_id BIGINT UNSIGNED NULL,
  status ENUM(
    'not_contacted',
    'contacted',
    'confirmed',
    'not_home',
    'refused',
    'moved',
    'wrong_address'
  ) NOT NULL DEFAULT 'contacted',
  party VARCHAR(64) NULL,
  notes VARCHAR(512) NULL,
  recorded_by INT NOT NULL,
  recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_turf_stop (turf_id, voter_geo_id),
  KEY idx_outcome_org (organization_id),
  KEY idx_outcome_turf (turf_id),
  KEY idx_outcome_status (status),
  CONSTRAINT fk_outcome_turf
    FOREIGN KEY (turf_id) REFERENCES turfs (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_outcome_geo
    FOREIGN KEY (voter_geo_id) REFERENCES voter_geo (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
