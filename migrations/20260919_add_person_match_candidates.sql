-- FM1: Fuzzy-match candidate pairs (blocking only)
-- Pairs are across different cluster_keys that share a block.
-- Scoring / review / merge come in FM2–FM4. MySQL stores candidates; matching runs offline.

CREATE TABLE IF NOT EXISTS person_match_candidates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  run_id VARCHAR(64) NOT NULL,
  -- Ordered person_record ids (left_id < right_id) to keep the pair unique
  left_person_id BIGINT UNSIGNED NOT NULL,
  right_person_id BIGINT UNSIGNED NOT NULL,
  left_cluster_key VARCHAR(64) NOT NULL,
  right_cluster_key VARCHAR(64) NOT NULL,
  block_key VARCHAR(128) NOT NULL,
  block_strategy ENUM('zip_phonetic', 'geo_phonetic') NOT NULL,
  -- FM1 leaves score/decision null; FM2 fills them
  score DECIMAL(6, 4) NULL,
  decision ENUM('pending', 'auto_merge', 'review', 'reject') NOT NULL DEFAULT 'pending',
  field_scores JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_match_pair_run (organization_id, run_id, left_person_id, right_person_id),
  KEY idx_match_org_run (organization_id, run_id),
  KEY idx_match_block (organization_id, block_key),
  KEY idx_match_decision (organization_id, decision),
  KEY idx_match_left (left_person_id),
  KEY idx_match_right (right_person_id),
  CONSTRAINT fk_match_left_person
    FOREIGN KEY (left_person_id) REFERENCES person_records (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_match_right_person
    FOREIGN KEY (right_person_id) REFERENCES person_records (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
