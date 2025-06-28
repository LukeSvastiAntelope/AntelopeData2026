-- Migration: Add source tracking for surveys and responses
-- This allows us to track whether surveys/responses came from imports vs. native creation

-- Add source tracking to surveys table
ALTER TABLE surveys 
ADD COLUMN source ENUM('native', 'csv_import', 'excel_import', 'surveymonkey_import', 'typeform_import', 'google_forms_import') DEFAULT 'native' AFTER status,
ADD COLUMN source_metadata JSON NULL AFTER source;

-- Add source tracking to survey_responses table  
ALTER TABLE survey_responses
ADD COLUMN source ENUM('native', 'import', 'api') DEFAULT 'native' AFTER user_agent,
ADD COLUMN agent_token VARCHAR(255) NULL AFTER source;

-- Add index for source queries
ALTER TABLE surveys ADD INDEX idx_source (source);
ALTER TABLE survey_responses ADD INDEX idx_source (source);
ALTER TABLE survey_responses ADD INDEX idx_agent_token (agent_token);

-- Update responder_agents table to include email field (if not already present)
-- This helps with digital twin deduplication across surveys
ALTER TABLE responder_agents 
ADD COLUMN email VARCHAR(255) NULL AFTER agent_token;

-- Add index for email lookups
ALTER TABLE responder_agents ADD INDEX idx_email (email); 