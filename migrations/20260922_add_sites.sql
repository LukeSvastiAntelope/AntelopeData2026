-- Sites S1: Candidate Website Builder — site model (org-scoped, slot-based templates)
-- A published site is a DB row served at /s/<slug> in a later phase.

CREATE TABLE IF NOT EXISTS sites (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  slug VARCHAR(96) NOT NULL,
  template_id VARCHAR(64) NOT NULL,
  -- Theme overrides (colors, fonts) layered on design tokens
  theme JSON NOT NULL,
  -- Named editable slots: hero, about, issues[], endorsements[], cta, footer (+ meta)
  content JSON NOT NULL,
  -- Tier-gated page flags, e.g. ["home"] or ["home","issues","events","volunteer","donate"]
  enabled_pages JSON NOT NULL,
  status ENUM('draft', 'published') NOT NULL DEFAULT 'draft',
  published_at TIMESTAMP NULL DEFAULT NULL,
  created_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_sites_slug (slug),
  KEY idx_sites_org (organization_id),
  KEY idx_sites_org_status (organization_id, status),
  KEY idx_sites_created_by (created_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
