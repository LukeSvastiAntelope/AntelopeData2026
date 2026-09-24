-- MiniVAN M3: paid-canvasser flag + GPS breadcrumbs (tenant-scoped, no voter PII).
-- Breadcrumbs are separate from voter/turf address records — payroll only.

ALTER TABLE organization_members
  ADD COLUMN is_paid_canvasser TINYINT(1) NOT NULL DEFAULT 0
    AFTER status;

CREATE TABLE IF NOT EXISTS canvass_gps_breadcrumbs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  canvasser_user_id INT NOT NULL,
  turf_id BIGINT UNSIGNED NULL,
  walk_token_id BIGINT UNSIGNED NULL,
  -- Idempotent offline retry (unique per org)
  client_event_id VARCHAR(64) NOT NULL,
  latitude DECIMAL(10, 7) NOT NULL,
  longitude DECIMAL(10, 7) NOT NULL,
  accuracy_m DECIMAL(8, 2) NULL,
  recorded_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_gps_client_event (organization_id, client_event_id),
  KEY idx_gps_org_user_day (organization_id, canvasser_user_id, recorded_at),
  KEY idx_gps_org_recorded (organization_id, recorded_at),
  KEY idx_gps_turf (turf_id),
  CONSTRAINT fk_gps_breadcrumb_turf
    FOREIGN KEY (turf_id) REFERENCES turfs (id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Optional daily rollup cache (miles/hours/doors) — recomputed on demand; kept for export speed.
CREATE TABLE IF NOT EXISTS canvass_payroll_days (
  organization_id INT NOT NULL,
  canvasser_user_id INT NOT NULL,
  work_date DATE NOT NULL,
  miles DECIMAL(10, 3) NOT NULL DEFAULT 0,
  hours DECIMAL(8, 3) NOT NULL DEFAULT 0,
  doors INT NOT NULL DEFAULT 0,
  breadcrumb_count INT NOT NULL DEFAULT 0,
  first_at TIMESTAMP NULL,
  last_at TIMESTAMP NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (organization_id, canvasser_user_id, work_date),
  KEY idx_payroll_org_date (organization_id, work_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
