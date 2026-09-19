-- P2: Materialized propensity view (recomputed from event stream — NOT a frozen ballistic score).
-- Comment on table makes the invariant explicit for operators and future migrations.

CREATE TABLE IF NOT EXISTS voter_propensity (
  person_record_id BIGINT UNSIGNED NOT NULL,
  organization_id INT NOT NULL,
  -- Cold-start prior (recomputed from Map inputs at refresh)
  p0 DECIMAL(6, 5) NOT NULL,
  -- Accumulated recency-weighted engagement evidence
  evidence_e DECIMAL(10, 4) NOT NULL DEFAULT 0,
  -- prior_weight w = exp(-k · e)
  prior_weight DECIMAL(6, 5) NOT NULL DEFAULT 1,
  -- Observed posterior from engagement; NULL until directional signal
  posterior_q DECIMAL(6, 5) NULL,
  -- Blended propensity P = w·p0 + (1−w)·q  (equals p0 when q IS NULL)
  propensity DECIMAL(6, 5) NOT NULL,
  -- confidence = 1 − w
  confidence DECIMAL(6, 5) NOT NULL DEFAULT 0,
  tier ENUM('hot', 'warm', 'cold') NOT NULL DEFAULT 'warm',
  decay_k DECIMAL(8, 5) NOT NULL,
  formula_version VARCHAR(32) NOT NULL DEFAULT 'p2.blend.v1',
  evidence_json JSON NULL,
  recomputed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (person_record_id),
  KEY idx_vp_org (organization_id),
  KEY idx_vp_org_tier (organization_id, tier),
  KEY idx_vp_org_propensity (organization_id, propensity),
  KEY idx_vp_recomputed (recomputed_at),
  CONSTRAINT fk_vp_person
    FOREIGN KEY (person_record_id) REFERENCES person_records (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='MATERIALIZED VIEW: voter propensity — refresh on engagement events; never treat as static score';
