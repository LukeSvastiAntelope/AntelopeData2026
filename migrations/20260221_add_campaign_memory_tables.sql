-- Campaign memory metadata and retrieval audit tables.
-- Vector embeddings are stored in Pinecone; this schema tracks metadata and linkage.

CREATE TABLE IF NOT EXISTS campaign_memory_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  org_id BIGINT UNSIGNED NULL,
  user_id BIGINT UNSIGNED NULL,
  memory_type ENUM('fact', 'preference', 'event', 'summary') NOT NULL,
  content TEXT NOT NULL,
  importance_score DECIMAL(5,4) NOT NULL DEFAULT 0.5000,
  confidence_score DECIMAL(5,4) NOT NULL DEFAULT 0.5000,
  source_conversation_id VARCHAR(128) NULL,
  source_message_id VARCHAR(128) NULL,
  last_used_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_campaign_memory_scope (org_id, user_id, memory_type),
  INDEX idx_campaign_memory_last_used (last_used_at),
  INDEX idx_campaign_memory_created_at (created_at)
);

CREATE TABLE IF NOT EXISTS campaign_memory_embeddings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  memory_item_id BIGINT UNSIGNED NOT NULL,
  pinecone_id VARCHAR(191) NOT NULL,
  pinecone_namespace VARCHAR(191) NOT NULL,
  embedding_model VARCHAR(100) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_campaign_memory_item (memory_item_id),
  UNIQUE KEY uq_campaign_memory_pinecone (pinecone_id),
  INDEX idx_campaign_memory_namespace (pinecone_namespace),
  CONSTRAINT fk_campaign_memory_embedding_item
    FOREIGN KEY (memory_item_id)
    REFERENCES campaign_memory_items(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS campaign_memory_retrieval_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  trace_id VARCHAR(128) NOT NULL,
  org_id BIGINT UNSIGNED NULL,
  user_id BIGINT UNSIGNED NULL,
  query_text TEXT NOT NULL,
  retrieval_namespace VARCHAR(191) NOT NULL,
  top_k INT NOT NULL DEFAULT 8,
  retrieved_memory_ids JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_campaign_memory_retrieval_trace (trace_id),
  INDEX idx_campaign_memory_retrieval_scope (org_id, user_id),
  INDEX idx_campaign_memory_retrieval_created (created_at)
);
