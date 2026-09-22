-- Sites S3: org-level add-on entitlements (website first; Stripe later hangs on this seam)

CREATE TABLE IF NOT EXISTS org_entitlements (
  organization_id INT NOT NULL,
  entitlement VARCHAR(64) NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  enabled_at TIMESTAMP NULL DEFAULT NULL,
  enabled_by BIGINT NULL,
  -- Optional Stripe / billing metadata (payment not built yet)
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (organization_id, entitlement),
  KEY idx_org_entitlements_enabled (organization_id, enabled),
  CONSTRAINT fk_org_entitlements_org
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
