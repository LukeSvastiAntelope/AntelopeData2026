-- Dashboard automations: bots and scrapers (news by district, companies by region, BBC commodity news, etc.)
CREATE TABLE IF NOT EXISTS dashboard_automations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  type VARCHAR(64) NOT NULL COMMENT 'news_scraper | company_scraper | bbc_commodity_bot',
  name VARCHAR(255) NOT NULL,
  config JSON NOT NULL COMMENT 'type-specific params: state, district, region, min_employees, keywords, etc.',
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  last_run_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_dashboard_automations_user (user_id),
  KEY idx_dashboard_automations_type (type)
);
