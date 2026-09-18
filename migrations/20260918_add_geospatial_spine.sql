-- G1 Geospatial spine: geocoded voter points + saved fences (MySQL spatial)
-- Axis order for SRID 4326 WKT in MySQL: latitude then longitude.
-- SPATIAL INDEX columns must be NOT NULL — pending geocode rows use Null Island
-- POINT(0 0) as placeholder; queries always filter geocode_status IN ('ok','provider').

CREATE TABLE IF NOT EXISTS voter_geo (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NULL,
  responder_agent_id INT NULL,
  voter_file_id VARCHAR(100) NULL,
  street VARCHAR(255) NULL,
  city VARCHAR(128) NULL,
  state CHAR(2) NULL,
  zip VARCHAR(10) NULL,
  latitude DECIMAL(10, 7) NULL,
  longitude DECIMAL(10, 7) NULL,
  -- MySQL SRID 4326 WKT axis order is lat lng (see scripts/geospatial/test-axis-order.ts)
  -- Placeholder POINT(0 0) until geocoded; never matched by addressesInFence (status filter)
  pt POINT SRID 4326 NOT NULL,
  geocode_status ENUM('pending', 'ok', 'failed', 'skipped', 'provider') NOT NULL DEFAULT 'pending',
  geocode_source VARCHAR(64) NULL,
  geocode_confidence DECIMAL(4, 3) NULL,
  geocode_error VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_voter_geo_agent (responder_agent_id),
  UNIQUE KEY uq_voter_geo_org_file (organization_id, voter_file_id),
  KEY idx_voter_geo_org (organization_id),
  KEY idx_voter_geo_status (geocode_status),
  KEY idx_voter_geo_zip (zip),
  SPATIAL INDEX idx_voter_geo_pt (pt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS geofences (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  label VARCHAR(128) NOT NULL,
  fence_type ENUM('polygon', 'circle') NOT NULL DEFAULT 'polygon',
  -- include = turf/canvass area; exclude = DNC / skip zone; general = reusable analysis
  purpose ENUM('include', 'exclude', 'general') NOT NULL DEFAULT 'include',
  -- GEOMETRY (not POLYGON) so MULTIPOLYGON district shapefiles can land later (G4)
  -- Placeholder empty point until geometry set; CRUD always writes real geom on create
  geom GEOMETRY SRID 4326 NOT NULL,
  ring_json JSON NULL,
  center_lat DECIMAL(10, 7) NULL,
  center_lng DECIMAL(10, 7) NULL,
  radius_m DOUBLE NULL,
  color VARCHAR(32) NULL,
  notes VARCHAR(512) NULL,
  created_by INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_geofence_org_label (organization_id, label),
  KEY idx_geofence_org (organization_id),
  KEY idx_geofence_purpose (purpose),
  SPATIAL INDEX idx_geofence_geom (geom)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
