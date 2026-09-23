-- Sites S5: tenant-scoped site form submissions (signup/contact/volunteer/donate)

CREATE TABLE IF NOT EXISTS site_form_submissions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  site_id BIGINT UNSIGNED NOT NULL,
  site_slug VARCHAR(96) NOT NULL,
  form_type ENUM('signup', 'contact', 'volunteer', 'donate') NOT NULL,
  name VARCHAR(255) NULL,
  email VARCHAR(255) NULL,
  phone VARCHAR(32) NULL,
  message TEXT NULL,
  amount_cents INT NULL,
  person_record_id BIGINT UNSIGNED NULL,
  suppressed TINYINT(1) NOT NULL DEFAULT 0,
  metadata JSON NULL,
  ip VARCHAR(64) NULL,
  user_agent VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_site_forms_org (organization_id, form_type, created_at),
  KEY idx_site_forms_slug (site_slug, form_type),
  KEY idx_site_forms_site (site_id),
  KEY idx_site_forms_person (person_record_id),
  CONSTRAINT fk_site_forms_org
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
