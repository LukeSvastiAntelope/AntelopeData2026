-- Migration to add 'stopped' status to the surveys status ENUM
-- This allows the new campaign management system to properly stop campaigns

-- Add 'stopped' to the status ENUM
ALTER TABLE surveys 
MODIFY COLUMN status ENUM('draft','scheduled','active','published','closed','archived','stopped') 
DEFAULT 'draft'; 