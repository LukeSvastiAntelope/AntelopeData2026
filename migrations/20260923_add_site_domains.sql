-- Sites S6: custom domains mapped to sites (verified hosts → site_id)

CREATE TABLE IF NOT EXISTS site_domains (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  site_id BIGINT UNSIGNED NOT NULL,
  organization_id INT NOT NULL,
  host VARCHAR(253) NOT NULL,
  verified TINYINT(1) NOT NULL DEFAULT 0,
  verification_token VARCHAR(64) NOT NULL,
  vercel_domain_id VARCHAR(128) NULL,
  dns_instructions JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  verified_at TIMESTAMP NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_site_domains_host (host),
  KEY idx_site_domains_site (site_id),
  KEY idx_site_domains_org (organization_id),
  KEY idx_site_domains_verified (host, verified),
  CONSTRAINT fk_site_domains_site
    FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  CONSTRAINT fk_site_domains_org
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
