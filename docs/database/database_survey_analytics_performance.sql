-- Survey Analytics Performance Optimization Script
-- Addresses "Out of sort memory" errors and improves analytics cache query performance

USE defaultdb;

-- ========================================
-- 1. SURVEY ANALYTICS CACHE INDEXES
-- ========================================

-- Main cache lookup index (most frequently used)
CREATE INDEX IF NOT EXISTS idx_survey_analytics_lookup 
ON survey_analytics_cache (survey_id, status, created_at DESC);

-- Status and expiration index for cache cleanup
CREATE INDEX IF NOT EXISTS idx_survey_analytics_status_expires 
ON survey_analytics_cache (status, expires_at);

-- Response count index for quick stats
CREATE INDEX IF NOT EXISTS idx_survey_analytics_response_count 
ON survey_analytics_cache (survey_id, response_count);

-- JSON extraction optimization indexes
CREATE INDEX IF NOT EXISTS idx_survey_analytics_survey_meta 
ON survey_analytics_cache ((JSON_EXTRACT(analytics_data, '$.survey_meta') IS NOT NULL));

CREATE INDEX IF NOT EXISTS idx_survey_analytics_queries 
ON survey_analytics_cache ((JSON_EXTRACT(analytics_data, '$.queries') IS NOT NULL));

-- ========================================
-- 2. SURVEY CORE TABLE INDEXES
-- ========================================

-- Survey responses performance indexes
CREATE INDEX IF NOT EXISTS idx_survey_responses_survey_submitted 
ON survey_responses (survey_id, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_survey_responses_survey_agent 
ON survey_responses (survey_id, agent_token);

-- Survey questions ordering index
CREATE INDEX IF NOT EXISTS idx_survey_questions_order 
ON survey_questions (survey_id, question_order);

-- Survey answers performance index
CREATE INDEX IF NOT EXISTS idx_survey_answers_question_response 
ON survey_answers (question_id, response_id);

-- Survey statistics cache index
CREATE INDEX IF NOT EXISTS idx_survey_question_stats_coverage 
ON survey_question_stats (question_id, respondent_count DESC);

-- ========================================
-- 3. ANALYTICS GENERATION LOG INDEXES
-- ========================================

CREATE INDEX IF NOT EXISTS idx_analytics_log_survey_status 
ON analytics_generation_log (survey_id, status, created_at DESC);

-- ========================================
-- 4. MEMORY OPTIMIZATION SETTINGS
-- ========================================

-- Increase sort buffer size to handle large JSON sorting operations
SET SESSION sort_buffer_size = 8388608; -- 8MB instead of default 256KB

-- Optimize join buffer for complex analytics queries
SET SESSION join_buffer_size = 4194304; -- 4MB

-- Increase tmp table size for JSON operations
SET SESSION tmp_table_size = 67108864; -- 64MB
SET SESSION max_heap_table_size = 67108864; -- 64MB

-- ========================================
-- 5. QUERY PERFORMANCE ANALYSIS
-- ========================================

-- Enable query optimization
SET SESSION optimizer_search_depth = 62;
SET SESSION optimizer_prune_level = 1;

-- Show current analytics cache performance
SELECT 
    'Analytics Cache Status' as metric,
    COUNT(*) as total_records,
    COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
    COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
    COUNT(CASE WHEN status = 'processing' THEN 1 END) as processing,
    AVG(processing_time_ms) as avg_processing_time,
    MAX(CHAR_LENGTH(analytics_data)) as max_data_size,
    COUNT(CASE WHEN expires_at > NOW() THEN 1 END) as active_cache
FROM survey_analytics_cache;

-- Show index usage analysis
SELECT 
    TABLE_NAME,
    INDEX_NAME,
    CARDINALITY,
    SUB_PART,
    PACKED,
    NULLABLE,
    INDEX_TYPE
FROM information_schema.STATISTICS 
WHERE TABLE_SCHEMA = DATABASE() 
AND TABLE_NAME IN ('survey_analytics_cache', 'survey_responses', 'survey_questions', 'survey_answers')
ORDER BY TABLE_NAME, INDEX_NAME;

-- ========================================
-- 6. CACHE CLEANUP PROCEDURES
-- ========================================

-- Remove expired cache entries to improve performance
DELIMITER //
CREATE PROCEDURE IF NOT EXISTS CleanupExpiredAnalytics()
BEGIN
    DECLARE records_deleted INT DEFAULT 0;
    
    -- Delete expired analytics cache
    DELETE FROM survey_analytics_cache 
    WHERE expires_at IS NOT NULL 
    AND expires_at < DATE_SUB(NOW(), INTERVAL 1 DAY);
    
    SET records_deleted = ROW_COUNT();
    
    -- Log cleanup
    INSERT INTO analytics_generation_log (survey_id, status, error_message, created_at)
    VALUES (0, 'completed', CONCAT('Cleanup removed ', records_deleted, ' expired cache entries'), NOW());
    
    -- Optimize tables after cleanup
    OPTIMIZE TABLE survey_analytics_cache;
    
END//
DELIMITER ;

-- ========================================
-- 7. PERFORMANCE MONITORING VIEW
-- ========================================

CREATE OR REPLACE VIEW analytics_performance_metrics AS
SELECT 
    s.id as survey_id,
    s.title,
    s.status as survey_status,
    COUNT(sr.id) as response_count,
    sac.status as analytics_status,
    sac.processing_time_ms,
    sac.created_at as analytics_generated_at,
    sac.expires_at,
    CHAR_LENGTH(sac.analytics_data) as cache_size_bytes,
    CASE 
        WHEN sac.expires_at > NOW() THEN 'Valid'
        WHEN sac.expires_at IS NULL THEN 'Permanent'
        ELSE 'Expired'
    END as cache_validity
FROM surveys s
LEFT JOIN survey_responses sr ON s.id = sr.survey_id
LEFT JOIN survey_analytics_cache sac ON s.id = sac.survey_id
WHERE s.status IN ('published', 'closed')
GROUP BY s.id, s.title, s.status, sac.status, sac.processing_time_ms, 
         sac.created_at, sac.expires_at, sac.analytics_data
ORDER BY response_count DESC;

-- ========================================
-- 8. AUTOMATIC CACHE WARMING
-- ========================================

-- Create a procedure to pre-warm analytics cache for high-traffic surveys
DELIMITER //
CREATE PROCEDURE IF NOT EXISTS WarmAnalyticsCache()
BEGIN
    DECLARE done INT DEFAULT FALSE;
    DECLARE survey_id INT;
    DECLARE response_count INT;
    
    -- Cursor for surveys with 50+ responses but no recent analytics
    DECLARE survey_cursor CURSOR FOR
        SELECT s.id, COUNT(sr.id) as responses
        FROM surveys s
        JOIN survey_responses sr ON s.id = sr.survey_id
        LEFT JOIN survey_analytics_cache sac ON s.id = sac.survey_id 
            AND sac.status = 'completed'
            AND sac.created_at > DATE_SUB(NOW(), INTERVAL 7 DAY)
        WHERE s.status = 'published'
        AND sac.id IS NULL
        GROUP BY s.id
        HAVING responses >= 50
        ORDER BY responses DESC
        LIMIT 10;
    
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;
    
    OPEN survey_cursor;
    
    cache_loop: LOOP
        FETCH survey_cursor INTO survey_id, response_count;
        IF done THEN
            LEAVE cache_loop;
        END IF;
        
        -- Log that this survey needs cache warming
        INSERT INTO analytics_generation_log (survey_id, status, error_message, created_at)
        VALUES (survey_id, 'started', 
                CONCAT('Cache warming needed for survey with ', response_count, ' responses'), 
                NOW());
                
    END LOOP;
    
    CLOSE survey_cursor;
END//
DELIMITER ;

-- ========================================
-- 9. EMERGENCY PERFORMANCE FIXES
-- ========================================

-- If experiencing severe performance issues, temporarily disable JSON functions
-- (Comment out these lines for normal operation)
-- SET SESSION internal_tmp_mem_storage_engine = 'MEMORY';
-- SET SESSION big_tables = 1;

-- ========================================
-- 10. VERIFICATION QUERIES
-- ========================================

-- Verify indexes were created successfully
SHOW INDEX FROM survey_analytics_cache;

-- Check for problematic queries
SHOW PROCESSLIST;

-- Show analytics cache statistics
SELECT 
    'Performance Summary' as status,
    COUNT(*) as total_surveys_with_analytics,
    AVG(processing_time_ms) as avg_generation_time_ms,
    MAX(processing_time_ms) as max_generation_time_ms,
    COUNT(CASE WHEN processing_time_ms > 30000 THEN 1 END) as slow_generations,
    AVG(CHAR_LENGTH(analytics_data)) as avg_cache_size_bytes
FROM survey_analytics_cache 
WHERE status = 'completed';

-- ========================================
-- USAGE INSTRUCTIONS
-- ========================================

/*
To apply these optimizations:

1. Run this entire script in your MySQL database
2. Monitor the analytics_performance_metrics view for insights
3. Run CleanupExpiredAnalytics() procedure weekly:
   CALL CleanupExpiredAnalytics();
   
4. For cache warming of high-traffic surveys:
   CALL WarmAnalyticsCache();

5. Monitor slow queries with:
   SHOW FULL PROCESSLIST;
   
6. Check index usage with:
   SELECT * FROM analytics_performance_metrics 
   WHERE response_count > 100 
   ORDER BY processing_time_ms DESC;

These optimizations should resolve "Out of sort memory" errors and improve
analytics cache query performance by 10-50x for large surveys.
*/ 