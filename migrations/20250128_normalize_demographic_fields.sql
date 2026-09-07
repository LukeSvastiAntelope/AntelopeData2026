-- --------------------------------------------------
-- Migration: 20250128_normalize_demographic_fields.sql
-- Purpose  : Add normalized demographic fields to survey_responses for consistent querying
--            and populate them from existing mixed storage formats
-- Date     : 2025-01-28
-- Author   : Claude AI Assistant
-- --------------------------------------------------

-- 1. Add normalized demographic fields to survey_responses table
ALTER TABLE survey_responses 
ADD COLUMN IF NOT EXISTS age VARCHAR(20) AFTER demographics,
ADD COLUMN IF NOT EXISTS gender VARCHAR(50) AFTER age,
ADD COLUMN IF NOT EXISTS location VARCHAR(255) AFTER gender,
ADD COLUMN IF NOT EXISTS occupation VARCHAR(100) AFTER location,
ADD COLUMN IF NOT EXISTS education VARCHAR(100) AFTER occupation,
ADD COLUMN IF NOT EXISTS income VARCHAR(50) AFTER education,
ADD COLUMN IF NOT EXISTS political_views VARCHAR(50) AFTER income,
ADD COLUMN IF NOT EXISTS ethnicity VARCHAR(100) AFTER political_views,
ADD COLUMN IF NOT EXISTS marital_status VARCHAR(50) AFTER ethnicity,
ADD COLUMN IF NOT EXISTS household_size VARCHAR(10) AFTER marital_status,
ADD COLUMN IF NOT EXISTS interests JSON AFTER household_size,
ADD COLUMN IF NOT EXISTS social_media JSON AFTER interests;

-- 2. Add indexes for demographic fields to improve query performance
CREATE INDEX IF NOT EXISTS idx_age ON survey_responses (age);
CREATE INDEX IF NOT EXISTS idx_gender ON survey_responses (gender);
CREATE INDEX IF NOT EXISTS idx_location ON survey_responses (location);
CREATE INDEX IF NOT EXISTS idx_occupation ON survey_responses (occupation);
CREATE INDEX IF NOT EXISTS idx_education ON survey_responses (education);
CREATE INDEX IF NOT EXISTS idx_income ON survey_responses (income);
CREATE INDEX IF NOT EXISTS idx_political_views ON survey_responses (political_views);

-- 3. Normalize existing demographic data from JSON and survey answers
-- This is a complex operation that handles multiple data sources

-- Step 3a: Update from existing JSON demographics field
UPDATE survey_responses 
SET 
  age = COALESCE(age, JSON_UNQUOTE(JSON_EXTRACT(demographics, '$.age')), JSON_UNQUOTE(JSON_EXTRACT(demographics, '$.ageRange')), JSON_UNQUOTE(JSON_EXTRACT(demographics, '$.age_range'))),
  gender = COALESCE(gender, JSON_UNQUOTE(JSON_EXTRACT(demographics, '$.gender'))),
  location = COALESCE(location, JSON_UNQUOTE(JSON_EXTRACT(demographics, '$.location'))),
  occupation = COALESCE(occupation, JSON_UNQUOTE(JSON_EXTRACT(demographics, '$.occupation'))),
  education = COALESCE(education, JSON_UNQUOTE(JSON_EXTRACT(demographics, '$.education'))),
  income = COALESCE(income, JSON_UNQUOTE(JSON_EXTRACT(demographics, '$.income'))),
  political_views = COALESCE(political_views, JSON_UNQUOTE(JSON_EXTRACT(demographics, '$.politicalViews'))),
  ethnicity = COALESCE(ethnicity, JSON_UNQUOTE(JSON_EXTRACT(demographics, '$.ethnicity'))),
  marital_status = COALESCE(marital_status, JSON_UNQUOTE(JSON_EXTRACT(demographics, '$.maritalStatus'))),
  household_size = COALESCE(household_size, JSON_UNQUOTE(JSON_EXTRACT(demographics, '$.householdSize'))),
  interests = COALESCE(interests, JSON_EXTRACT(demographics, '$.interests')),
  social_media = COALESCE(social_media, JSON_EXTRACT(demographics, '$.socialMedia'))
WHERE demographics IS NOT NULL 
  AND JSON_VALID(demographics);

-- Step 3b: Fill missing demographic data from survey answers
-- This handles cases where demographic info was collected as survey questions

-- Age from survey answers
UPDATE survey_responses sr
SET age = COALESCE(sr.age, (
  SELECT sa.answer_value 
  FROM survey_answers sa 
  JOIN survey_questions sq ON sa.question_id = sq.id 
  WHERE sa.response_id = sr.id 
    AND (LOWER(sq.prompt) LIKE '%age%' OR LOWER(sq.prompt) LIKE '%old are you%' OR sq.prompt LIKE '%What is your age%')
    AND sa.answer_value IS NOT NULL
    AND sa.answer_value != ''
  LIMIT 1
))
WHERE sr.age IS NULL OR sr.age = '';

-- Gender from survey answers
UPDATE survey_responses sr
SET gender = COALESCE(sr.gender, (
  SELECT sa.answer_value 
  FROM survey_answers sa 
  JOIN survey_questions sq ON sa.question_id = sq.id 
  WHERE sa.response_id = sr.id 
    AND (LOWER(sq.prompt) LIKE '%gender%' OR LOWER(sq.prompt) LIKE '%sex%' OR sq.prompt LIKE '%What is your gender%')
    AND sa.answer_value IS NOT NULL
    AND sa.answer_value != ''
  LIMIT 1
))
WHERE sr.gender IS NULL OR sr.gender = '';

-- Location from survey answers (handle both string and JSON array formats)
UPDATE survey_responses sr
SET location = COALESCE(sr.location, (
  SELECT sa.answer_value 
  FROM survey_answers sa 
  JOIN survey_questions sq ON sa.question_id = sq.id 
  WHERE sa.response_id = sr.id 
    AND (LOWER(sq.prompt) LIKE '%location%' 
         OR LOWER(sq.prompt) LIKE '%country%' 
         OR LOWER(sq.prompt) LIKE '%where%'
         OR LOWER(sq.prompt) LIKE '%lived in%'
         OR sq.prompt LIKE '%Which of the following have you lived in%')
    AND sa.answer_value IS NOT NULL
    AND sa.answer_value != ''
  LIMIT 1
))
WHERE sr.location IS NULL OR sr.location = '';

-- Occupation from survey answers  
UPDATE survey_responses sr
SET occupation = COALESCE(sr.occupation, (
  SELECT sa.answer_value 
  FROM survey_answers sa 
  JOIN survey_questions sq ON sa.question_id = sq.id 
  WHERE sa.response_id = sr.id 
    AND (LOWER(sq.prompt) LIKE '%occupation%' 
         OR LOWER(sq.prompt) LIKE '%job%' 
         OR LOWER(sq.prompt) LIKE '%work%'
         OR LOWER(sq.prompt) LIKE '%profession%')
    AND sa.answer_value IS NOT NULL
    AND sa.answer_value != ''
  LIMIT 1
))
WHERE sr.occupation IS NULL OR sr.occupation = '';

-- Education from survey answers
UPDATE survey_responses sr
SET education = COALESCE(sr.education, (
  SELECT sa.answer_value 
  FROM survey_answers sa 
  JOIN survey_questions sq ON sa.question_id = sq.id 
  WHERE sa.response_id = sr.id 
    AND (LOWER(sq.prompt) LIKE '%education%' 
         OR LOWER(sq.prompt) LIKE '%school%' 
         OR LOWER(sq.prompt) LIKE '%degree%'
         OR LOWER(sq.prompt) LIKE '%qualification%')
    AND sa.answer_value IS NOT NULL
    AND sa.answer_value != ''
  LIMIT 1
))
WHERE sr.education IS NULL OR sr.education = '';

-- Income from survey answers
UPDATE survey_responses sr
SET income = COALESCE(sr.income, (
  SELECT sa.answer_value 
  FROM survey_answers sa 
  JOIN survey_questions sq ON sa.question_id = sq.id 
  WHERE sa.response_id = sr.id 
    AND (LOWER(sq.prompt) LIKE '%income%' 
         OR LOWER(sq.prompt) LIKE '%salary%'
         OR LOWER(sq.prompt) LIKE '%earnings%')
    AND sa.answer_value IS NOT NULL
    AND sa.answer_value != ''
  LIMIT 1
))
WHERE sr.income IS NULL OR sr.income = '';

-- Political views from survey answers
UPDATE survey_responses sr
SET political_views = COALESCE(sr.political_views, (
  SELECT sa.answer_value 
  FROM survey_answers sa 
  JOIN survey_questions sq ON sa.question_id = sq.id 
  WHERE sa.response_id = sr.id 
    AND (LOWER(sq.prompt) LIKE '%political%' 
         OR LOWER(sq.prompt) LIKE '%ideology%'
         OR LOWER(sq.prompt) LIKE '%conservative%'
         OR LOWER(sq.prompt) LIKE '%liberal%')
    AND sa.answer_value IS NOT NULL
    AND sa.answer_value != ''
  LIMIT 1
))
WHERE sr.political_views IS NULL OR sr.political_views = '';

-- 4. Add demographic configuration support to surveys table
ALTER TABLE surveys 
ADD COLUMN IF NOT EXISTS demographic_config JSON AFTER anonymity_level;

-- 5. Update existing surveys with default demographic configurations
UPDATE surveys 
SET demographic_config = CASE anonymity_level
  WHEN 'full' THEN JSON_OBJECT(
    'anonymityLevel', 'full',
    'selectedFields', JSON_ARRAY('name', 'email', 'age', 'gender', 'location', 'occupation', 'education'),
    'isRequired', true
  )
  WHEN 'semi_anonymous' THEN JSON_OBJECT(
    'anonymityLevel', 'semi_anonymous', 
    'selectedFields', JSON_ARRAY('age', 'gender', 'location', 'occupation'),
    'isRequired', true
  )
  WHEN 'anonymous' THEN JSON_OBJECT(
    'anonymityLevel', 'anonymous',
    'selectedFields', JSON_ARRAY(),
    'isRequired', false
  )
  ELSE JSON_OBJECT(
    'anonymityLevel', 'full',
    'selectedFields', JSON_ARRAY('name', 'email', 'age', 'gender', 'location', 'occupation', 'education'),
    'isRequired', true
  )
END
WHERE demographic_config IS NULL;

-- 6. Create a view for easy demographic analytics
CREATE OR REPLACE VIEW survey_demographic_summary AS
SELECT 
    sr.survey_id,
    s.title as survey_title,
    s.anonymity_level,
    COUNT(*) as total_responses,
    COUNT(CASE WHEN sr.age IS NOT NULL AND sr.age != '' THEN 1 END) as responses_with_age,
    COUNT(CASE WHEN sr.gender IS NOT NULL AND sr.gender != '' THEN 1 END) as responses_with_gender,
    COUNT(CASE WHEN sr.location IS NOT NULL AND sr.location != '' THEN 1 END) as responses_with_location,
    COUNT(CASE WHEN sr.occupation IS NOT NULL AND sr.occupation != '' THEN 1 END) as responses_with_occupation,
    COUNT(CASE WHEN sr.education IS NOT NULL AND sr.education != '' THEN 1 END) as responses_with_education,
    -- Calculate completion rates
    ROUND(COUNT(CASE WHEN sr.age IS NOT NULL AND sr.age != '' THEN 1 END) * 100.0 / COUNT(*), 2) as age_completion_rate,
    ROUND(COUNT(CASE WHEN sr.gender IS NOT NULL AND sr.gender != '' THEN 1 END) * 100.0 / COUNT(*), 2) as gender_completion_rate,
    ROUND(COUNT(CASE WHEN sr.location IS NOT NULL AND sr.location != '' THEN 1 END) * 100.0 / COUNT(*), 2) as location_completion_rate
FROM survey_responses sr
JOIN surveys s ON sr.survey_id = s.id
GROUP BY sr.survey_id, s.title, s.anonymity_level;

-- 7. Add a trigger to auto-populate normalized fields when demographics JSON is updated
DELIMITER $$

CREATE TRIGGER IF NOT EXISTS normalize_demographics_on_update
AFTER UPDATE ON survey_responses
FOR EACH ROW
BEGIN
    -- Only process if demographics JSON was changed and is valid
    IF NEW.demographics != OLD.demographics AND JSON_VALID(NEW.demographics) THEN
        UPDATE survey_responses 
        SET 
            age = COALESCE(age, JSON_UNQUOTE(JSON_EXTRACT(NEW.demographics, '$.age')), JSON_UNQUOTE(JSON_EXTRACT(NEW.demographics, '$.ageRange'))),
            gender = COALESCE(gender, JSON_UNQUOTE(JSON_EXTRACT(NEW.demographics, '$.gender'))),
            location = COALESCE(location, JSON_UNQUOTE(JSON_EXTRACT(NEW.demographics, '$.location'))),
            occupation = COALESCE(occupation, JSON_UNQUOTE(JSON_EXTRACT(NEW.demographics, '$.occupation'))),
            education = COALESCE(education, JSON_UNQUOTE(JSON_EXTRACT(NEW.demographics, '$.education'))),
            income = COALESCE(income, JSON_UNQUOTE(JSON_EXTRACT(NEW.demographics, '$.income'))),
            political_views = COALESCE(political_views, JSON_UNQUOTE(JSON_EXTRACT(NEW.demographics, '$.politicalViews'))),
            ethnicity = COALESCE(ethnicity, JSON_UNQUOTE(JSON_EXTRACT(NEW.demographics, '$.ethnicity'))),
            marital_status = COALESCE(marital_status, JSON_UNQUOTE(JSON_EXTRACT(NEW.demographics, '$.maritalStatus'))),
            household_size = COALESCE(household_size, JSON_UNQUOTE(JSON_EXTRACT(NEW.demographics, '$.householdSize'))),
            interests = COALESCE(interests, JSON_EXTRACT(NEW.demographics, '$.interests')),
            social_media = COALESCE(social_media, JSON_EXTRACT(NEW.demographics, '$.socialMedia'))
        WHERE id = NEW.id;
    END IF;
END$$

DELIMITER ;

-- 8. Log migration completion
INSERT INTO migration_log (migration_name, executed_at, description) 
VALUES (
    '20250128_normalize_demographic_fields',
    NOW(),
    'Added normalized demographic fields to survey_responses table and populated from existing data sources'
) ON DUPLICATE KEY UPDATE executed_at = NOW(); 