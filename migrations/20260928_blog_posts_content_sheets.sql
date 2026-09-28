-- Admin A3: blog CMS + editable feature/pricing content sheets.

CREATE TABLE IF NOT EXISTS blog_posts (
  id VARCHAR(128) NOT NULL PRIMARY KEY
    COMMENT 'URL slug, e.g. our-history',
  title VARCHAR(512) NOT NULL,
  excerpt TEXT NOT NULL,
  content MEDIUMTEXT NOT NULL,
  date_display VARCHAR(64) NOT NULL
    COMMENT 'Display date string, e.g. 15 Jul 2026',
  read_time VARCHAR(32) NOT NULL
    COMMENT 'e.g. 6 min',
  tags_json JSON NOT NULL,
  author_name VARCHAR(255) NOT NULL,
  author_avatar VARCHAR(512) NULL,
  status ENUM('draft', 'published') NOT NULL DEFAULT 'draft',
  published_at TIMESTAMP NULL DEFAULT NULL,
  sort_order INT NOT NULL DEFAULT 0
    COMMENT 'Lower sorts first on the public index',
  created_by INT UNSIGNED NULL,
  updated_by INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_blog_posts_status_sort (status, sort_order, published_at),
  KEY idx_blog_posts_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS content_sheets (
  sheet_key VARCHAR(64) NOT NULL PRIMARY KEY
    COMMENT 'e.g. pricing',
  title VARCHAR(255) NOT NULL,
  content_json JSON NOT NULL,
  updated_by INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
