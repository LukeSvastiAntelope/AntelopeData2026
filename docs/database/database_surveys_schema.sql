-- Survey & Digital-Twin Feature Database Schema
-- Add these tables to your existing MySQL database

-- Main survey table
CREATE TABLE surveys (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    slug VARCHAR(255) UNIQUE NOT NULL,
    created_by INT NOT NULL,
    is_public BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    status ENUM('draft', 'published', 'closed') DEFAULT 'draft',
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_slug (slug),
    INDEX idx_created_by (created_by),
    INDEX idx_status (status)
);

-- Survey questions table
CREATE TABLE survey_questions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    survey_id INT NOT NULL,
    type ENUM('text', 'single-choice', 'multi-choice', 'scale', 'email', 'number') NOT NULL,
    prompt TEXT NOT NULL,
    options JSON, -- For choice-based questions
    media JSON, -- { url, alt }
    option_media JSON, -- array of { url, alt }
    is_required BOOLEAN DEFAULT FALSE,
    question_order INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE,
    INDEX idx_survey_id (survey_id),
    INDEX idx_order (survey_id, question_order)
);

-- Survey responses (one per respondent)
CREATE TABLE survey_responses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    survey_id INT NOT NULL,
    responder_id INT NULL, -- NULL if anonymous
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    demographics JSON, -- Store name, age, sex, political views, etc.
    ip_address VARCHAR(45), -- For rate limiting
    user_agent TEXT,
    FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE,
    FOREIGN KEY (responder_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_survey_id (survey_id),
    INDEX idx_submitted_at (submitted_at),
    INDEX idx_ip_address (ip_address)
);

-- Individual answers to questions
CREATE TABLE survey_answers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    response_id INT NOT NULL,
    question_id INT NOT NULL,
    answer_value TEXT, -- Store as text, parse based on question type
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (response_id) REFERENCES survey_responses(id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES survey_questions(id) ON DELETE CASCADE,
    UNIQUE KEY unique_response_question (response_id, question_id),
    INDEX idx_response_id (response_id),
    INDEX idx_question_id (question_id)
);

-- Responder agents (digital twins)
CREATE TABLE responder_agents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    base_profile JSON NOT NULL, -- Generated persona from answers
    enrichment_status ENUM('pending', 'processing', 'completed', 'failed') DEFAULT 'pending',
    created_from_response_id INT NOT NULL,
    agent_token VARCHAR(255) UNIQUE, -- For querying this agent
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_queried_at TIMESTAMP NULL,
    query_count INT DEFAULT 0,
    FOREIGN KEY (created_from_response_id) REFERENCES survey_responses(id) ON DELETE CASCADE,
    INDEX idx_response_id (created_from_response_id),
    INDEX idx_token (agent_token),
    INDEX idx_enrichment_status (enrichment_status)
);

-- Optional: Agent query log for analytics
CREATE TABLE agent_queries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    responder_agent_id INT NOT NULL,
    query_text TEXT NOT NULL,
    response_text TEXT,
    queried_by INT, -- User who made the query
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    response_time_ms INT,
    FOREIGN KEY (responder_agent_id) REFERENCES responder_agents(id) ON DELETE CASCADE,
    FOREIGN KEY (queried_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_agent_id (responder_agent_id),
    INDEX idx_queried_by (queried_by),
    INDEX idx_created_at (created_at)
); 