-- --------------------------------------------------
-- Migration: 20250127_fix_anonymous_profile_enum.sql
-- Purpose  : Add 'anonymous_profile' to demographic_category ENUM for anonymous digital twins
-- Date     : 2025-01-27
-- --------------------------------------------------

-- Add 'anonymous_profile' to the demographic_category ENUM
ALTER TABLE responder_agents 
MODIFY COLUMN demographic_category ENUM('full_profile', 'partial_profile', 'minimal_profile', 'imported_synthetic', 'anonymous_profile') DEFAULT 'full_profile';

-- Update the index to include the new enum value
ALTER TABLE responder_agents DROP INDEX idx_demographic_category;
CREATE INDEX idx_demographic_category ON responder_agents (demographic_category);

-- Update the digital_twin_analytics view to include anonymous_profile category
DROP VIEW IF EXISTS digital_twin_analytics;
CREATE VIEW digital_twin_analytics AS
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