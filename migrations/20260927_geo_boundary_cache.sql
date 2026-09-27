-- Data D3: cache TIGER/cartographic state-legislative district geometries (per state).

CREATE TABLE IF NOT EXISTS geo_boundary_cache (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  layer ENUM('sldl', 'sldu') NOT NULL
    COMMENT 'Census SLDL (lower/house) or SLDU (upper/senate)',
  state CHAR(2) NOT NULL,
  year SMALLINT NOT NULL DEFAULT 2023,
  feature_count INT NOT NULL DEFAULT 0,
  geojson MEDIUMTEXT NOT NULL
    COMMENT 'Normalized FeatureCollection with district_code props',
  fetched_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_geo_boundary_layer_state_year (layer, state, year),
  KEY idx_geo_boundary_state (state)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
