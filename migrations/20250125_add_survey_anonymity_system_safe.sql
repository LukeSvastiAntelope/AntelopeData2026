-- --------------------------------------------------
-- Migration: 20250125_add_survey_anonymity_system_safe.sql
-- Purpose  : Safely add anonymity system columns without disrupting existing functionality
-- Date     : 2025-01-25
-- --------------------------------------------------

-- 1. Add anonymity level to surveys table (only if it doesn't exist)
ALTER TABLE surveys 
ADD COLUMN IF NOT EXISTS anonymity_level ENUM('full', 'semi_anonymous', 'anonymous') DEFAULT 'full' AFTER is_public,
ADD INDEX IF NOT EXISTS idx_anonymity_level (anonymity_level);

-- 2. Add completion tracking to responder_agents (digital twins)
ALTER TABLE responder_agents 
ADD COLUMN IF NOT EXISTS completion_percentage DECIMAL(5,2) DEFAULT 0.00 AFTER created_from_response_id,
ADD COLUMN IF NOT EXISTS demographic_category ENUM('full_profile', 'partial_profile', 'minimal_profile', 'imported_synthetic') DEFAULT 'full_profile' AFTER completion_percentage,
ADD INDEX IF NOT EXISTS idx_completion_percentage (completion_percentage),
ADD INDEX IF NOT EXISTS idx_demographic_category (demographic_category);

-- 3. Add anonymity level to survey_responses
ALTER TABLE survey_responses 
ADD COLUMN IF NOT EXISTS anonymity_level ENUM('full', 'semi_anonymous', 'anonymous') DEFAULT 'full' AFTER demographics,
ADD INDEX IF NOT EXISTS idx_response_anonymity_level (anonymity_level);

-- 4. Update existing surveys to have default anonymity level (safe update)
UPDATE surveys SET anonymity_level = 'full' WHERE anonymity_level IS NULL;

-- 5. Update existing survey responses to have default anonymity level (safe update)
UPDATE survey_responses SET anonymity_level = 'full' WHERE anonymity_level IS NULL;

-- 6. Update existing digital twins with initial completion percentage and category
-- This calculates based on existing demographic data
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

-- 7. Create audit table for anonymity changes (only if it doesn't exist)
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

-- 8. Create index for better performance on digital twin queries
CREATE INDEX IF NOT EXISTS idx_digital_twin_quality ON responder_agents (demographic_category, completion_percentage DESC);

-- 9. Create view for digital twin analytics (replace if exists)
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