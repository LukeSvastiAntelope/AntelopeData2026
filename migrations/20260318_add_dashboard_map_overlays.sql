-- Add dashboard map overlays (fundraising/report widgets)

CREATE TABLE IF NOT EXISTS dashboard_map_overlays (
  id INT AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  overlay_type ENUM('fundraising_report') NOT NULL,
  report_id VARCHAR(36) NULL,
  enabled_metrics JSON NULL,
  status ENUM('enabled','disabled') NOT NULL DEFAULT 'enabled',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_overlay_org (organization_id, overlay_type, status),
  INDEX idx_overlay_report (report_id),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

