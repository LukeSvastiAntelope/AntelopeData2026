-- Add conversation type column to chat_conversations table
-- This distinguishes between 'chat' and 'code' conversation types

ALTER TABLE chat_conversations 
ADD COLUMN type ENUM('chat', 'code') DEFAULT 'chat' NOT NULL;

-- Add index for type column for better query performance
ALTER TABLE chat_conversations 
ADD INDEX idx_type (type); 