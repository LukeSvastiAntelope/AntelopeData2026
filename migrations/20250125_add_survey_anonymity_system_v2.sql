-- --------------------------------------------------
-- Migration: 20250125_add_survey_anonymity_system_v2.sql
-- Purpose  : Safely add anonymity system columns (MySQL compatible)
-- Date     : 2025-01-25
-- --------------------------------------------------

-- 1. Add anonymity level to surveys table
-- Check if column exists first, then add if missing
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() 
     AND TABLE_NAME = 'surveys' 
     AND COLUMN_NAME = 'anonymity_level') = 0,
    'ALTER TABLE surveys ADD COLUMN anonymity_level ENUM(''full'', ''semi_anonymous'', ''anonymous'') DEFAULT ''full'' AFTER is_public',
    'SELECT "anonymity_level column already exists" AS message'
));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add index for anonymity_level
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS 
     WHERE TABLE_SCHEMA = DATABASE() 
     AND TABLE_NAME = 'surveys' 
     AND INDEX_NAME = 'idx_anonymity_level') = 0,
    'ALTER TABLE surveys ADD INDEX idx_anonymity_level (anonymity_level)',
    'SELECT "idx_anonymity_level index already exists" AS message'
));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. Add completion tracking to responder_agents
-- Add completion_percentage column
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() 
     AND TABLE_NAME = 'responder_agents' 
     AND COLUMN_NAME = 'completion_percentage') = 0,
    'ALTER TABLE responder_agents ADD COLUMN completion_percentage DECIMAL(5,2) DEFAULT 0.00 AFTER created_from_response_id',
    'SELECT "completion_percentage column already exists" AS message'
));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add demographic_category column
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() 
     AND TABLE_NAME = 'responder_agents' 
     AND COLUMN_NAME = 'demographic_category') = 0,
    'ALTER TABLE responder_agents ADD COLUMN demographic_category ENUM(''full_profile'', ''partial_profile'', ''minimal_profile'', ''imported_synthetic'') DEFAULT ''full_profile''',
    'SELECT "demographic_category column already exists" AS message'
));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add indexes for responder_agents
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS 
     WHERE TABLE_SCHEMA = DATABASE() 
     AND TABLE_NAME = 'responder_agents' 
     AND INDEX_NAME = 'idx_completion_percentage') = 0,
    'ALTER TABLE responder_agents ADD INDEX idx_completion_percentage (completion_percentage)',
    'SELECT "idx_completion_percentage index already exists" AS message'
));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS 
     WHERE TABLE_SCHEMA = DATABASE() 
     AND TABLE_NAME = 'responder_agents' 
     AND INDEX_NAME = 'idx_demographic_category') = 0,
    'ALTER TABLE responder_agents ADD INDEX idx_demographic_category (demographic_category)',
    'SELECT "idx_demographic_category index already exists" AS message'
));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3. Add anonymity level to survey_responses
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() 
     AND TABLE_NAME = 'survey_responses' 
     AND COLUMN_NAME = 'anonymity_level') = 0,
    'ALTER TABLE survey_responses ADD COLUMN anonymity_level ENUM(''full'', ''semi_anonymous'', ''anonymous'') DEFAULT ''full'' AFTER demographics',
    'SELECT "anonymity_level column already exists in survey_responses" AS message'
));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add index for survey_responses anonymity_level
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS 
     WHERE TABLE_SCHEMA = DATABASE() 
     AND TABLE_NAME = 'survey_responses' 
     AND INDEX_NAME = 'idx_response_anonymity_level') = 0,
    'ALTER TABLE survey_responses ADD INDEX idx_response_anonymity_level (anonymity_level)',
    'SELECT "idx_response_anonymity_level index already exists" AS message'
));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 4. Update existing data safely
-- Update surveys with default anonymity level
UPDATE surveys SET anonymity_level = 'full' WHERE anonymity_level IS NULL;

-- Update survey responses with default anonymity level  
UPDATE survey_responses SET anonymity_level = 'full' WHERE anonymity_level IS NULL;

-- 5. Update existing digital twins with completion data
UPDATE responder_agents ra
JOIN survey_responses sr ON ra.created_from_response_id = sr.id
SET 
  ra.completion_percentage = CASE 
    WHEN sr.demographics IS NOT NULL AND JSON_LENGTH(sr.demographics) >= 8 THEN 85.00
    WHEN sr.demographics IS NOT NULL AND JSON_LENGTH(sr.demographics) >= 5 THEN 65.00
    WHEN sr.demographics IS NOT NULL AND JSON_LENGTH(sr.demographics) >= 2 THEN 35.00
    ELSE 15.00
  END,
  ra.demographic_category = CASE
    WHEN sr.demographics IS NOT NULL AND JSON_LENGTH(sr.demographics) >= 8 THEN 'full_profile'
    WHEN sr.demographics IS NOT NULL AND JSON_LENGTH(sr.demographics) >= 5 THEN 'partial_profile'
    WHEN sr.demographics IS NOT NULL AND JSON_LENGTH(sr.demographics) >= 2 THEN 'minimal_profile'
    ELSE 'imported_synthetic'
  END
WHERE ra.completion_percentage = 0.00;

-- 6. Create audit table (only if it doesn't exist)
CREATE TABLE IF NOT EXISTS survey_anonymity_audit (
    id INT AUTO_INCREMENT PRIMARY KEY,
    survey_id INT NOT NULL,
    old_anonymity_level ENUM('full', 'semi_anonymous', 'anonymous'),
    new_anonymity_level ENUM('full', 'semi_anonymous', 'anonymous') NOT NULL,
    changed_by BIGINT NOT NULL,
    change_reason TEXT,
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE,
    FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_survey_audit (survey_id),
    INDEX idx_changed_at (changed_at)
);

-- 7. Create performance index
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS 
     WHERE TABLE_SCHEMA = DATABASE() 
     AND TABLE_NAME = 'responder_agents' 
     AND INDEX_NAME = 'idx_digital_twin_quality') = 0,
    'ALTER TABLE responder_agents ADD INDEX idx_digital_twin_quality (demographic_category, completion_percentage DESC)',
    'SELECT "idx_digital_twin_quality index already exists" AS message'
));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 8. Create analytics view
CREATE OR REPLACE VIEW digital_twin_analytics AS
SELECT 
    demographic_category,
    COUNT(*) as twin_count,
    AVG(completion_percentage) as avg_completion,
    MIN(completion_percentage) as min_completion,
    MAX(completion_percentage) as max_completion,
    COUNT(CASE WHEN completion_percentage >= 80 THEN 1 END) as high_quality_count,
    COUNT(CASE WHEN completion_percentage >= 40 AND completion_percentage < 80 THEN 1 END) as medium_quality_count,
    COUNT(CASE WHEN completion_percentage < 40 THEN 1 END) as low_quality_count
FROM responder_agents 
GROUP BY demographic_category; 