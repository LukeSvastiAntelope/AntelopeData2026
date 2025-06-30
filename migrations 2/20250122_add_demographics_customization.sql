-- --------------------------------------------------
-- Migration: 20250122_add_demographics_customization.sql
-- Purpose  : Add demographics customization system for surveys
--            Allows survey creators to configure simple or advanced demographics
-- --------------------------------------------------

-- Pre-defined demographic templates for simple mode
CREATE TABLE demographic_templates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    field_name VARCHAR(100) NOT NULL UNIQUE,
    field_type ENUM('text', 'select', 'multi-select', 'number', 'date', 'boolean', 'scale') NOT NULL,
    field_label VARCHAR(200) NOT NULL,
    field_options JSON, -- For select/multi-select fields
    validation_rules JSON, -- Min/max, required, regex, etc.
    category ENUM('basic', 'professional', 'personal', 'social') DEFAULT 'basic',
    sort_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    help_text TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_category (category),
    INDEX idx_active (is_active),
    INDEX idx_sort_order (sort_order)
);

-- Survey-specific demographic configuration
CREATE TABLE survey_demographics_config (
    id INT AUTO_INCREMENT PRIMARY KEY,
    survey_id INT NOT NULL,
    demographic_type ENUM('simple', 'advanced') NOT NULL DEFAULT 'simple',
    selected_fields JSON NOT NULL, -- Array of template IDs for simple, full config for advanced
    is_required BOOLEAN DEFAULT FALSE,
    consent_text TEXT, -- Custom consent message
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE,
    UNIQUE KEY unique_survey_demographics (survey_id),
    INDEX idx_survey_id (survey_id),
    INDEX idx_demographic_type (demographic_type)
);

-- Custom demographic fields for advanced mode
CREATE TABLE custom_demographic_fields (
    id INT AUTO_INCREMENT PRIMARY KEY,
    survey_id INT NOT NULL,
    field_name VARCHAR(100) NOT NULL,
    field_type ENUM('text', 'select', 'multi-select', 'number', 'date', 'boolean', 'scale') NOT NULL,
    field_label VARCHAR(200) NOT NULL,
    field_options JSON, -- For select/multi-select fields
    validation_rules JSON, -- Min/max, required, regex, etc.
    sort_order INT DEFAULT 0,
    is_required BOOLEAN DEFAULT FALSE,
    help_text TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE,
    INDEX idx_survey_id (survey_id),
    INDEX idx_sort_order (survey_id, sort_order),
    UNIQUE KEY unique_survey_field_name (survey_id, field_name)
);

-- Demographic responses from survey participants (replaces direct JSON storage)
CREATE TABLE survey_demographic_responses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    survey_response_id INT NOT NULL,
    field_name VARCHAR(100) NOT NULL,
    field_value JSON NOT NULL, -- Flexible storage for any response type
    field_type ENUM('text', 'select', 'multi-select', 'number', 'date', 'boolean', 'scale') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (survey_response_id) REFERENCES survey_responses(id) ON DELETE CASCADE,
    INDEX idx_response_id (survey_response_id),
    INDEX idx_field_name (field_name),
    INDEX idx_field_type (field_type),
    UNIQUE KEY unique_response_field (survey_response_id, field_name)
);

-- Add demographics configuration columns to existing surveys table
ALTER TABLE surveys 
ADD COLUMN has_demographics BOOLEAN DEFAULT FALSE,
ADD COLUMN demographics_required BOOLEAN DEFAULT FALSE,
ADD INDEX idx_has_demographics (has_demographics);

-- Insert default demographic templates for simple mode
INSERT INTO demographic_templates (field_name, field_type, field_label, field_options, validation_rules, category, sort_order, help_text) VALUES
-- Basic Demographics
('age', 'select', 'Age Range', 
 '["Under 18", "18-24", "25-34", "35-44", "45-54", "55-64", "65+"]', 
 '{"required": false}', 'basic', 1, 'Select your age range'),

('gender', 'select', 'Gender', 
 '["Male", "Female", "Non-binary", "Prefer not to say", "Other"]', 
 '{"required": false}', 'basic', 2, 'Select your gender identity'),

('location_country', 'select', 'Country', 
 '["United States", "Canada", "United Kingdom", "Australia", "Germany", "France", "Other"]', 
 '{"required": false}', 'basic', 3, 'Select your country of residence'),

('location_state', 'text', 'State/Province', 
 NULL, 
 '{"required": false, "maxLength": 100}', 'basic', 4, 'Enter your state or province'),

('education', 'select', 'Education Level', 
 '["High School", "Some College", "Bachelor''s Degree", "Master''s Degree", "Doctorate", "Trade School", "Other"]', 
 '{"required": false}', 'basic', 5, 'Select your highest education level'),

('income', 'select', 'Income Range', 
 '["Under $25k", "$25k-$50k", "$50k-$75k", "$75k-$100k", "$100k-$150k", "$150k+", "Prefer not to say"]', 
 '{"required": false}', 'basic', 6, 'Select your annual income range'),

-- Professional Demographics
('employment_status', 'select', 'Employment Status', 
 '["Full-time", "Part-time", "Self-employed", "Student", "Retired", "Unemployed", "Other"]', 
 '{"required": false}', 'professional', 7, 'Select your current employment status'),

('industry', 'select', 'Industry', 
 '["Technology", "Healthcare", "Finance", "Education", "Retail", "Manufacturing", "Government", "Non-profit", "Other"]', 
 '{"required": false}', 'professional', 8, 'Select your industry'),

('job_title', 'text', 'Job Title', 
 NULL, 
 '{"required": false, "maxLength": 100}', 'professional', 9, 'Enter your current job title'),

-- Social Demographics
('political_affiliation', 'select', 'Political Affiliation', 
 '["Democrat", "Republican", "Independent", "Libertarian", "Green", "Other", "Prefer not to say"]', 
 '{"required": false}', 'social', 10, 'Select your political affiliation'),

('marital_status', 'select', 'Marital Status', 
 '["Single", "Married", "Divorced", "Widowed", "In a relationship", "Prefer not to say"]', 
 '{"required": false}', 'social', 11, 'Select your marital status'),

('household_size', 'number', 'Household Size', 
 NULL, 
 '{"required": false, "min": 1, "max": 20}', 'social', 12, 'Number of people in your household');

-- --------------------------------------------------
-- Rollback (if needed)
-- --------------------------------------------------
-- DROP TABLE survey_demographic_responses;
-- DROP TABLE custom_demographic_fields;
-- DROP TABLE survey_demographics_config;
-- DROP TABLE demographic_templates;
-- ALTER TABLE surveys DROP COLUMN has_demographics, DROP COLUMN demographics_required; 