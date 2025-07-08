-- Create conversations table for cohort chat system
-- This table stores full conversation objects with metadata

CREATE TABLE IF NOT EXISTS chat_conversations (
    id VARCHAR(255) PRIMARY KEY,
    user_id BIGINT NOT NULL,
    title VARCHAR(500) NOT NULL,
    messages JSON NOT NULL, -- Store the full conversation messages array
    survey_id INT NULL,
    cohort_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE SET NULL,
    FOREIGN KEY (cohort_id) REFERENCES cohorts(id) ON DELETE SET NULL,
    INDEX idx_user_id (user_id),
    INDEX idx_survey_id (survey_id),
    INDEX idx_cohort_id (cohort_id),
    INDEX idx_updated_at (updated_at)
);

-- Note: We're using 'chat_conversations' to avoid conflicts with the existing 'conversations' table
-- which is used for individual agent messages in the askAgent system 