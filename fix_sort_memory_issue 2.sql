-- Quick fix for "Out of sort memory" issue
-- Focus on the immediate problem with analytics cache queries

-- Add essential indexes for survey analytics cache
ALTER TABLE survey_analytics_cache ADD INDEX idx_survey_status_created (survey_id, status, created_at DESC);

-- Add index for survey responses queries  
ALTER TABLE survey_responses ADD INDEX idx_survey_submitted (survey_id, submitted_at DESC);

-- Add index for survey answers performance
ALTER TABLE survey_answers ADD INDEX idx_question_response (question_id, response_id);

-- Show the new indexes
SHOW INDEX FROM survey_analytics_cache WHERE Key_name LIKE 'idx_%';
SHOW INDEX FROM survey_responses WHERE Key_name LIKE 'idx_%';
SHOW INDEX FROM survey_answers WHERE Key_name LIKE 'idx_%';

-- Test the fixed query
SELECT 'Testing fixed analytics cache query...' as status;

SELECT id, created_at, status
FROM survey_analytics_cache 
WHERE survey_id = 81 AND status = 'completed'
ORDER BY created_at DESC 
LIMIT 1; 