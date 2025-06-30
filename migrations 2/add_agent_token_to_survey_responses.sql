-- Migration: Add agent_token column to survey_responses table
-- This enables proper many-to-many relationship between digital twins and survey responses

ALTER TABLE survey_responses 
ADD COLUMN agent_token VARCHAR(255) NULL,
ADD INDEX idx_agent_token (agent_token);

-- Update existing survey_responses to link them with their digital twins
UPDATE survey_responses sr
JOIN responder_agents ra ON sr.id = ra.created_from_response_id
SET sr.agent_token = ra.agent_token
WHERE sr.agent_token IS NULL;

-- Verify the migration
SELECT 
    COUNT(*) as total_responses,
    COUNT(agent_token) as responses_with_agent_token,
    COUNT(*) - COUNT(agent_token) as responses_without_agent_token
FROM survey_responses; 