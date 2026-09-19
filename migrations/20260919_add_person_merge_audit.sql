-- FM4: Idempotent, reversible fuzzy-merge write-back.
-- Soft-archives the loser (merged_into_person_id) instead of DELETE so every
-- merge can be undone from person_merge_audit.merged_from. Matching stays
-- offline; MySQL only stores results (no trigram/Levenshtein UDFs).

ALTER TABLE person_records
  ADD COLUMN merged_into_person_id BIGINT UNSIGNED NULL
    COMMENT 'Soft-archive: canonical survivor after fuzzy/manual merge; NULL = live'
    AFTER canvass_by_user_id,
  ADD COLUMN merged_at TIMESTAMP NULL
    AFTER merged_into_person_id,
  ADD KEY idx_person_merged_into (merged_into_person_id),
  ADD KEY idx_person_live (organization_id, merged_into_person_id);

CREATE TABLE IF NOT EXISTS person_merge_audit (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  survivor_person_id BIGINT UNSIGNED NOT NULL,
  loser_person_id BIGINT UNSIGNED NOT NULL,
  match_score DECIMAL(6, 4) NOT NULL,
  match_candidate_id BIGINT UNSIGNED NULL,
  merge_candidate_id BIGINT UNSIGNED NULL,
  run_id VARCHAR(64) NULL,
  -- Non-negotiable undo payload: which records were combined, score, timestamp
  merged_from JSON NOT NULL,
  -- Full row snapshots for exact reverse
  survivor_before JSON NOT NULL,
  loser_before JSON NOT NULL,
  survivor_after JSON NULL,
  -- FK / side-table moves so undo can reassign (and restore propensity)
  fk_moves JSON NOT NULL,
  status ENUM('applied', 'undone') NOT NULL DEFAULT 'applied',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  undone_at TIMESTAMP NULL,
  undone_by INT NULL,
  notes VARCHAR(512) NULL,
  -- One active merge per loser (NULL when undone → multiple undo history rows OK)
  loser_active_key BIGINT UNSIGNED
    GENERATED ALWAYS AS (IF(status = 'applied', loser_person_id, NULL)) STORED,
  UNIQUE KEY uq_merge_loser_active (organization_id, loser_active_key),
  KEY idx_merge_audit_org_status (organization_id, status),
  KEY idx_merge_audit_survivor (survivor_person_id),
  KEY idx_merge_audit_pair (organization_id, survivor_person_id, loser_person_id),
  KEY idx_merge_audit_created (organization_id, created_at),
  CONSTRAINT fk_merge_audit_survivor
    FOREIGN KEY (survivor_person_id) REFERENCES person_records (id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_merge_audit_loser
    FOREIGN KEY (loser_person_id) REFERENCES person_records (id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_merge_audit_match
    FOREIGN KEY (match_candidate_id) REFERENCES person_match_candidates (id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
