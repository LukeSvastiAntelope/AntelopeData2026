-- --------------------------------------------------
-- Migration: 20250123_add_survey_id_to_cohorts.sql
-- Purpose  : Add survey_id column to cohorts table to associate cohorts with specific surveys
-- --------------------------------------------------

-- Add survey_id column to cohorts table
ALTER TABLE cohorts 
ADD COLUMN survey_id INT NULL AFTER filter_json,
ADD INDEX idx_survey_id (survey_id);

-- Add foreign key constraint to surveys table
ALTER TABLE cohorts 
ADD CONSTRAINT fk_cohorts_survey_id 
FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE; 