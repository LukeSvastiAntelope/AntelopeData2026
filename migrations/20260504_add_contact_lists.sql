-- Migration: Contact lists for SMS outreach
-- contact_lists: named, saveable phone lists per user
-- contact_list_entries: individual contacts within a list

CREATE TABLE IF NOT EXISTS contact_lists (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  user_id       INT NOT NULL,
  name          VARCHAR(255) NOT NULL,
  description   TEXT NULL,
  source_file   VARCHAR(255) NULL,
  column_map    JSON NULL,       -- original column -> target field mapping used at import
  filter_prompt TEXT NULL,       -- AI filter prompt used to produce this list
  contact_count INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_contact_lists_user (user_id)
);

CREATE TABLE IF NOT EXISTS contact_list_entries (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  list_id     INT NOT NULL,
  phone       VARCHAR(30) NOT NULL,
  first_name  VARCHAR(100) NULL,
  last_name   VARCHAR(100) NULL,
  email       VARCHAR(255) NULL,
  birthdate   DATE NULL,
  age         SMALLINT NULL,
  district    VARCHAR(100) NULL,
  zip         VARCHAR(20) NULL,
  city        VARCHAR(100) NULL,
  state       VARCHAR(50) NULL,
  party       VARCHAR(100) NULL,
  extra_data  JSON NULL,         -- any columns not mapped to named fields
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (list_id) REFERENCES contact_lists(id) ON DELETE CASCADE,
  INDEX idx_entries_list (list_id),
  INDEX idx_entries_phone (phone)
);
