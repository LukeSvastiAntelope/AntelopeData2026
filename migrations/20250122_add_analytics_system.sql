-- AI-Powered Survey Analytics System
-- Simplified schema using JSON storage for flexibility

-- Single table to store all analytics results as JSON
CREATE TABLE IF NOT EXISTS survey_analytics_cache (
  id INT AUTO_INCREMENT PRIMARY KEY,
  survey_id INT NOT NULL,
  
  -- Core metadata (always present)
  status ENUM('completed', 'failed', 'processing') DEFAULT 'processing',
  response_count INT DEFAULT 0,
  processing_time_ms INT DEFAULT 0,
  
  -- All analytics data stored as flexible JSON
  analytics_data JSON,  -- Complete analytics result
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NULL,  -- For cache expiration
  
  -- Indexes for performance
  FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE,
  INDEX idx_survey_id (survey_id),
  INDEX idx_status (status),
  INDEX idx_expires (expires_at)
);

-- Optional: Simple log table for debugging (minimal columns)
CREATE TABLE IF NOT EXISTS analytics_generation_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  survey_id INT NOT NULL,
  status ENUM('started', 'completed', 'failed') NOT NULL,
  error_message TEXT NULL,
  processing_time_ms INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE,
  INDEX idx_survey_id (survey_id),
  INDEX idx_created_at (created_at)
); 