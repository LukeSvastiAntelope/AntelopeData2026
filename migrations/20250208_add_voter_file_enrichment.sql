-- Voter file enrichment support

-- Track which voter file enriched a survey response
ALTER TABLE survey_responses ADD COLUMN enrichment_source JSON NULL DEFAULT NULL;

-- External voter file ID on responder agents for deduplication
ALTER TABLE responder_agents ADD COLUMN voter_file_id VARCHAR(100) NULL DEFAULT NULL;
CREATE INDEX idx_responder_agents_voter_file ON responder_agents (voter_file_id);
