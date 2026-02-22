CREATE TABLE IF NOT EXISTS agent_situation_documents (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id BIGINT UNSIGNED NOT NULL,
  agent_id VARCHAR(64) NOT NULL,
  current_version INT UNSIGNED NOT NULL DEFAULT 1,
  snapshot_json JSON NOT NULL,
  updated_by_agent VARCHAR(64) NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_org_agent (org_id, agent_id),
  KEY idx_org_agent_updated (org_id, agent_id, updated_at)
);

CREATE TABLE IF NOT EXISTS agent_situation_document_versions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id BIGINT UNSIGNED NOT NULL,
  agent_id VARCHAR(64) NOT NULL,
  version INT UNSIGNED NOT NULL,
  snapshot_json JSON NOT NULL,
  delta_json JSON NULL,
  change_summary VARCHAR(512) NULL,
  changed_by_agent VARCHAR(64) NOT NULL,
  trace_id VARCHAR(128) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_org_agent_version (org_id, agent_id, version),
  KEY idx_org_agent_created (org_id, agent_id, created_at)
);
