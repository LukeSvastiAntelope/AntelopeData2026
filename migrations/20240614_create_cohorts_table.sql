-- --------------------------------------------------
-- Migration: 20240614_create_cohorts_table.sql
-- Purpose  : Add a table for saving reusable cohort filters.
-- --------------------------------------------------

CREATE TABLE IF NOT EXISTS cohorts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  filter_json JSON NOT NULL,   -- e.g. [{"field":"age_range","op":"IN","value":["18-24"]}]
  visibility ENUM('private', 'org', 'public') DEFAULT 'private',
  created_by BIGINT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_visibility (visibility),
  INDEX idx_created_by (created_by)
); 