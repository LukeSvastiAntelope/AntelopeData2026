-- Adds numeric answer_code column for advanced analytics
ALTER TABLE survey_answers 
  ADD COLUMN answer_code INT NULL AFTER answer_value,
  ADD INDEX idx_answer_code (answer_code); 