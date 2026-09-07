-- Migration: Add survey cloning/duplication support
-- This allows tracking parent-child relationships between original and cloned surveys
-- SAFE MIGRATION: Only adds new columns, does not modify or delete existing data

-- Add parent survey tracking to surveys table
ALTER TABLE surveys 
ADD COLUMN parent_survey_id INTEGER NULL REFERENCES surveys(id) ON DELETE SET NULL,
ADD COLUMN is_template BOOLEAN DEFAULT FALSE,
ADD COLUMN clone_count INTEGER DEFAULT 0,
ADD COLUMN cloned_at TIMESTAMP NULL;

-- Add indexes for efficient queries
CREATE INDEX idx_surveys_parent_id ON surveys(parent_survey_id);
CREATE INDEX idx_surveys_is_template ON surveys(is_template);
CREATE INDEX idx_surveys_clone_count ON surveys(clone_count);

-- Add comments for documentation
COMMENT ON COLUMN surveys.parent_survey_id IS 'ID of the survey this was cloned from (NULL for original surveys)';
COMMENT ON COLUMN surveys.is_template IS 'Whether this survey is marked as a reusable template';
COMMENT ON COLUMN surveys.clone_count IS 'Number of times this survey has been cloned';
COMMENT ON COLUMN surveys.cloned_at IS 'Timestamp when this survey was cloned (NULL for original surveys)';

-- Update source enum to include 'clone' as a source type
ALTER TABLE surveys 
MODIFY COLUMN source ENUM('native', 'csv_import', 'excel_import', 'surveymonkey_import', 'typeform_import', 'google_forms_import', 'google_sheets_import', 'clone') DEFAULT 'native'; 