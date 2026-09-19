-- FM3: Human review queue for ambiguous fuzzy-match pairs (no auto-merge).
-- Auto-merges update person_records directly; the ambiguous middle lands here.

CREATE TABLE IF NOT EXISTS merge_candidates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  person_a_id BIGINT UNSIGNED NOT NULL,
  person_b_id BIGINT UNSIGNED NOT NULL,
  match_candidate_id BIGINT UNSIGNED NULL,
  score DECIMAL(6, 4) NOT NULL,
  field_scores JSON NULL,
  status ENUM('pending', 'accepted', 'rejected') NOT NULL DEFAULT 'pending',
  reviewed_by INT NULL,
  reviewed_at TIMESTAMP NULL,
  notes VARCHAR(512) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_merge_pair_pending (organization_id, person_a_id, person_b_id, status),
  KEY idx_merge_org_status (organization_id, status),
  KEY idx_merge_score (organization_id, score),
  CONSTRAINT fk_merge_person_a
    FOREIGN KEY (person_a_id) REFERENCES person_records (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_merge_person_b
    FOREIGN KEY (person_b_id) REFERENCES person_records (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_merge_match_cand
    FOREIGN KEY (match_candidate_id) REFERENCES person_match_candidates (id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
