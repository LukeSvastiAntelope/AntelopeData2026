-- Add tracking poll / wave support to surveys table
-- Allows surveys to be linked as waves of a longitudinal study

ALTER TABLE surveys ADD COLUMN parent_survey_id INT NULL DEFAULT NULL;
ALTER TABLE surveys ADD COLUMN wave_number INT NULL DEFAULT NULL;

-- Index for efficiently finding all waves of a tracking poll
CREATE INDEX idx_surveys_parent_wave ON surveys (parent_survey_id, wave_number);

-- Foreign key to link waves to parent survey
ALTER TABLE surveys ADD CONSTRAINT fk_surveys_parent
  FOREIGN KEY (parent_survey_id) REFERENCES surveys(id) ON DELETE SET NULL;
