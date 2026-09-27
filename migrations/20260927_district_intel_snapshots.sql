-- Data D1: tenant-scoped District Intelligence Report snapshots.
-- Compute once, reuse within TTL — signup and dashboard share the same service.

CREATE TABLE IF NOT EXISTS district_intel_snapshots (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  district_key VARCHAR(32) NOT NULL
    COMMENT 'Normalized district code e.g. NJ-05',
  payload JSON NOT NULL
    COMMENT 'DistrictIntelPayload: district + external + intelligence',
  sources_health JSON NOT NULL
    COMMENT 'Per-source ok|partial|unavailable',
  generated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_district_intel_org_key (organization_id, district_key),
  KEY idx_district_intel_org_generated (organization_id, generated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
