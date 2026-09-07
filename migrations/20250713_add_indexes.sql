-- Add helpful indexes to speed up smart survey queries
-- Composite index for survey and question
ALTER TABLE survey_answers
    ADD INDEX idx_survey_answers_question (question_id); 