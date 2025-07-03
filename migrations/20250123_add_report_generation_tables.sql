-- Migration: Add Report Generation Tables
-- Date: 2025-01-23
-- Description: Creates tables for the report generation system

-- Reports table for metadata
CREATE TABLE IF NOT EXISTS reports (
  id VARCHAR(36) PRIMARY KEY,
  user_id BIGINT NOT NULL,
  survey_id INT,
  cohort_id INT,
  query_text TEXT NOT NULL,
  report_type ENUM('demographic', 'thematic', 'comparative', 'longitudinal', 'comprehensive'),
  status ENUM('initiated', 'processing', 'completed', 'failed') DEFAULT 'initiated',
  title VARCHAR(255),
  summary TEXT,
  token_usage INT,
  processing_time_ms INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL,
  metadata JSON,
  INDEX idx_user_reports (user_id, created_at),
  INDEX idx_status (status),
  INDEX idx_survey (survey_id),
  FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Report sections for modular storage
CREATE TABLE IF NOT EXISTS report_sections (
  id INT PRIMARY KEY AUTO_INCREMENT,
  report_id VARCHAR(36) NOT NULL,
  section_type ENUM('executive_summary', 'demographic_analysis', 'thematic_analysis', 
                    'statistical_analysis', 'insights', 'methodology', 'appendix'),
  title VARCHAR(255),
  content LONGTEXT,
  chart_specs JSON,
  order_index INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE,
  INDEX idx_report_sections (report_id, order_index)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Report embeddings for semantic search
CREATE TABLE IF NOT EXISTS report_embeddings (
  id INT PRIMARY KEY AUTO_INCREMENT,
  report_id VARCHAR(36) NOT NULL,
  section_id INT,
  embedding_id VARCHAR(255), -- Pinecone ID
  chunk_text TEXT,
  chunk_index INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE,
  FOREIGN KEY (section_id) REFERENCES report_sections(id) ON DELETE SET NULL,
  INDEX idx_report_embeddings (report_id),
  INDEX idx_embedding_id (embedding_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci; 