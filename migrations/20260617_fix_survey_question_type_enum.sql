-- Align survey_questions.type ENUM with the application's QuestionType values.
-- The base schema shipped an outdated set ('multi-choice','scale') and was
-- missing 'multiple-choice', 'rating', and 'yes-no', which the AI Survey Builder
-- and manual builder emit — causing "Data truncated for column 'type'" on save.
-- Superset keeps legacy values for backwards compatibility.
ALTER TABLE survey_questions
  MODIFY COLUMN type ENUM(
    'text',
    'single-choice',
    'multiple-choice',
    'multi-choice',
    'rating',
    'scale',
    'yes-no',
    'email',
    'number'
  ) NOT NULL;
