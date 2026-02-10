-- Add geographic center to organizations for map zoom target
ALTER TABLE organizations ADD COLUMN latitude DECIMAL(10, 7) DEFAULT 38.9072;
ALTER TABLE organizations ADD COLUMN longitude DECIMAL(10, 7) DEFAULT -77.0369;
ALTER TABLE organizations ADD COLUMN default_zoom TINYINT DEFAULT 10;
