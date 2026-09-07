-- Allow dedicated news conversations in chat_conversations.
ALTER TABLE chat_conversations
MODIFY COLUMN type ENUM('chat', 'news', 'code') DEFAULT 'chat' NOT NULL;

