-- Add persona/capabilities fields to responder_agents and origin/score fields to survey_responses

-- Responder agents: evolving persona and capability profile
ALTER TABLE responder_agents 
  ADD COLUMN IF NOT EXISTS persona_profile JSON NULL AFTER base_profile,
  ADD COLUMN IF NOT EXISTS capability_map JSON NULL AFTER persona_profile,
  ADD COLUMN IF NOT EXISTS last_enriched_at DATETIME NULL AFTER capability_map,
  ADD COLUMN IF NOT EXISTS persona_version INT NOT NULL DEFAULT 1 AFTER last_enriched_at;

-- Survey responses: mark synthetic origin and record twin metadata
ALTER TABLE survey_responses 
  ADD COLUMN IF NOT EXISTS response_origin ENUM('human','digital_twin') NOT NULL DEFAULT 'human' AFTER user_agent,
  ADD COLUMN IF NOT EXISTS twin_version INT NULL AFTER response_origin,
  ADD COLUMN IF NOT EXISTS twin_match_score FLOAT NULL AFTER twin_version;


