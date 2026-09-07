-- Allow cloned surveys: SurveyRepo.cloneSurvey inserts source='clone', but the
-- surveys.source ENUM shipped without it, causing "Data truncated for column
-- 'source'" (HTTP 500) on the Clone action. Add 'clone' to the ENUM.
ALTER TABLE surveys
  MODIFY COLUMN source ENUM(
    'native',
    'clone',
    'csv_import',
    'excel_import',
    'surveymonkey_import',
    'typeform_import',
    'google_forms_import'
  ) NULL DEFAULT 'native';
