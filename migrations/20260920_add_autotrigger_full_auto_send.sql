-- AT3: Explicit full-auto send opt-in on survey_autotrigger.
-- autonomy=auto never silently promotes approval-tier sends; full_auto_send
-- is the only survey-level override, and still goes through executeApprovedTool.

ALTER TABLE survey_autotrigger
  ADD COLUMN full_auto_send TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'Explicit opt-in: allow executeApprovedTool for staged public sends'
    AFTER autonomy;
