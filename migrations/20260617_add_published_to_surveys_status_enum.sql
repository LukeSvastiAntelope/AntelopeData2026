-- The featured-survey query (SurveyRepo.getSurveysForUser) selects
-- status='published', and the UI shows a "published" status, but the shipped
-- surveys.status ENUM omitted 'published' — so featured examples could never
-- appear and publishing to that state truncated. Add 'published' to the ENUM.
ALTER TABLE surveys
  MODIFY COLUMN status ENUM(
    'draft',
    'scheduled',
    'active',
    'published',
    'closed',
    'archived'
  ) NOT NULL DEFAULT 'draft';
