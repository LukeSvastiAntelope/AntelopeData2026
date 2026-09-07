-- Migration to update survey status model
-- Separating visibility (is_public) from campaign status

-- First, let's see what the current structure looks like and update accordingly
-- This migration assumes the surveys table already has is_public and status columns

-- Update existing 'published' surveys to 'active' since they're currently live
UPDATE surveys 
SET status = 'active' 
WHERE status = 'published';

-- Add new columns for campaign management
-- Note: These will error if columns already exist, which is fine for this migration
ALTER TABLE surveys 
ADD COLUMN campaign_start_at TIMESTAMP NULL COMMENT 'When the campaign starts accepting responses';

ALTER TABLE surveys 
ADD COLUMN campaign_end_at TIMESTAMP NULL COMMENT 'When the campaign stops accepting responses';

ALTER TABLE surveys 
ADD COLUMN stopped_at TIMESTAMP NULL COMMENT 'When the campaign was manually stopped';

ALTER TABLE surveys 
ADD COLUMN stopped_by INT NULL COMMENT 'User ID who stopped the campaign';

ALTER TABLE surveys 
ADD COLUMN stop_reason TEXT NULL COMMENT 'Reason for stopping the campaign';

-- Add indexes for performance on status queries
CREATE INDEX idx_surveys_status_public ON surveys (status, is_public);
CREATE INDEX idx_surveys_campaign_dates ON surveys (campaign_start_at, campaign_end_at);

-- Update any NULL is_public values to true (assuming existing surveys are public)
UPDATE surveys 
SET is_public = 1 
WHERE is_public IS NULL; 