-- --------------------------------------------------
-- Migration: 20250122_add_ethnicity_demographic.sql
-- Purpose  : Add ethnicity/race demographic field to demographic templates
-- --------------------------------------------------

-- Add ethnicity field to demographic templates
INSERT INTO demographic_templates (field_name, field_type, field_label, field_options, validation_rules, category, sort_order, help_text) VALUES
('ethnicity', 'select', 'Race/Ethnicity', 
 '["White", "Black or African American", "Hispanic or Latino", "Asian", "Native American", "Pacific Islander", "Mixed Race", "Other", "Prefer not to say"]', 
 '{"required": false}', 'basic', 3, 'Select your race or ethnicity');

-- Update sort order for existing fields to accommodate ethnicity
UPDATE demographic_templates SET sort_order = 4 WHERE field_name = 'location_country';
UPDATE demographic_templates SET sort_order = 5 WHERE field_name = 'location_state';
UPDATE demographic_templates SET sort_order = 6 WHERE field_name = 'education';
UPDATE demographic_templates SET sort_order = 7 WHERE field_name = 'income';
UPDATE demographic_templates SET sort_order = 8 WHERE field_name = 'employment_status';
UPDATE demographic_templates SET sort_order = 9 WHERE field_name = 'industry';
UPDATE demographic_templates SET sort_order = 10 WHERE field_name = 'job_title';
UPDATE demographic_templates SET sort_order = 11 WHERE field_name = 'political_affiliation';
UPDATE demographic_templates SET sort_order = 12 WHERE field_name = 'marital_status';
UPDATE demographic_templates SET sort_order = 13 WHERE field_name = 'household_size';

-- --------------------------------------------------
-- Rollback (if needed)
-- --------------------------------------------------
-- DELETE FROM demographic_templates WHERE field_name = 'ethnicity';
-- -- Restore original sort orders if needed 