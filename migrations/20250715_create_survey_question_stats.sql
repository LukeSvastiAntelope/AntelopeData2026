-- Create pre-computed statistics tables for survey questions
-- UP ---------------------------------------------------------------------

-- Main distribution table: one row per option (or numeric bucket) per question
-- We store both absolute count and percentage within the survey (for quick display)
CREATE TABLE IF NOT EXISTS survey_question_stats (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    survey_id INT NOT NULL,
    question_id INT NOT NULL,
    option_value VARCHAR(255) NOT NULL, -- e.g. "Strongly agree", "4", etc.
    respondent_count INT NOT NULL,
    respondent_pct DECIMAL(7,4) NOT NULL, -- 0-100 scale (e.g. 42.3567)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE,
    INDEX idx_survey_question (survey_id, question_id)
);

-- Optional demographic split table (age/gender/region etc.)
CREATE TABLE IF NOT EXISTS survey_question_demosplits (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    survey_id INT NOT NULL,
    question_id INT NOT NULL,
    demographic_key VARCHAR(50) NOT NULL,  -- e.g. "age_group", "gender"
    demographic_value VARCHAR(50) NOT NULL, -- e.g. "18-29", "Female"
    option_value VARCHAR(255) NOT NULL,
    respondent_count INT NOT NULL,
    respondent_pct DECIMAL(7,4) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE,
    INDEX idx_survey_question_demo (survey_id, question_id, demographic_key)
);

-- Mark surveys table with a processed flag so UI knows stats are ready
-- Guard: only add column if it does NOT already exist
SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'surveys'
    AND COLUMN_NAME = 'processed_stats'
);

SET @add_sql := IF(@col_exists = 0, 'ALTER TABLE surveys ADD COLUMN processed_stats TINYINT(1) DEFAULT 0;', 'SELECT 1');
PREPARE stmt FROM @add_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- DOWN -------------------------------------------------------------------
-- To rollback, simply drop the new tables and column.  This is safe because
-- all data here is derived from raw survey responses and can be regenerated.
--
-- DROP TABLE IF EXISTS survey_question_demosplits;
-- DROP TABLE IF EXISTS survey_question_stats;
-- ALTER TABLE surveys DROP COLUMN IF EXISTS processed_stats; 