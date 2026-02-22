CREATE TABLE IF NOT EXISTS campaign_news_items (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(512) NOT NULL,
  source VARCHAR(255) NULL,
  source_domain VARCHAR(255) NULL,
  url TEXT NOT NULL,
  url_hash CHAR(64) NOT NULL,
  title_hash CHAR(64) NOT NULL,
  published_at DATETIME NULL,
  summary TEXT NULL,
  relevance_score DECIMAL(5,2) NOT NULL DEFAULT 0,
  state CHAR(2) NULL,
  district_code VARCHAR(20) NULL,
  topic_tags JSON NULL,
  ingested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY idx_campaign_news_url_hash (url_hash),
  KEY idx_campaign_news_title_hash (title_hash),
  KEY idx_campaign_news_state (state),
  KEY idx_campaign_news_district_code (district_code),
  KEY idx_campaign_news_published_at (published_at)
);

