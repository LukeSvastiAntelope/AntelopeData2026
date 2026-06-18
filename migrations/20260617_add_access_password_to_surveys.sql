-- Password-protected private survey links. When a survey is private, the creator
-- sets a password; respondents must enter it before they can take the survey.
-- Stores a bcrypt hash (never the plaintext).
ALTER TABLE surveys
  ADD COLUMN access_password VARCHAR(255) NULL AFTER is_public;
