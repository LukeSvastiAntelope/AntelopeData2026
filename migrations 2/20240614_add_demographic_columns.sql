-- --------------------------------------------------
-- Migration: 20240614_add_demographic_columns.sql
-- Purpose  : Extract commonly-used demographic fields from the JSON
--            survey_responses.demographics column into STORED generated
--            columns so they can be indexed for fast cohort queries.
-- --------------------------------------------------

-- Make sure you are running MySQL 8.0 or newer (JSON + generated columns)
-- Run inside a transaction or via a migration tool (e.g., knex, flyway).

ALTER TABLE survey_responses
  -- Age range (e.g. "18-24")
  ADD COLUMN age_range VARCHAR(20) GENERATED ALWAYS AS (
    JSON_UNQUOTE(JSON_EXTRACT(demographics, '$.ageRange'))
  ) STORED,

  -- Political affiliation (e.g. "Democrat")
  ADD COLUMN political_affiliation VARCHAR(50) GENERATED ALWAYS AS (
    JSON_UNQUOTE(JSON_EXTRACT(demographics, '$.political'))
  ) STORED,

  -- Income bracket (e.g. "$50k–$75k")
  ADD COLUMN income_bracket VARCHAR(30) GENERATED ALWAYS AS (
    JSON_UNQUOTE(JSON_EXTRACT(demographics, '$.income'))
  ) STORED,

  -- Gender / sex (e.g. "Female")
  ADD COLUMN gender VARCHAR(10) GENERATED ALWAYS AS (
    JSON_UNQUOTE(JSON_EXTRACT(demographics, '$.gender'))
  ) STORED,

  -- Array of interests stored as JSON for flexible queries
  ADD COLUMN interests JSON GENERATED ALWAYS AS (
    JSON_EXTRACT(demographics, '$.interests')
  ) STORED,

  -- Indexes for fast filtering (omit JSON column – cannot be indexed)
  ADD INDEX idx_age_range (age_range),
  ADD INDEX idx_political_affiliation (political_affiliation),
  ADD INDEX idx_income_bracket (income_bracket),
  ADD INDEX idx_gender (gender);

-- After migration, existing rows automatically populate generated columns.
-- --------------------------------------------------
-- Rollback (if needed)
-- --------------------------------------------------
-- ALTER TABLE survey_responses
--   DROP COLUMN age_range,
--   DROP COLUMN political_affiliation,
--   DROP COLUMN income_bracket,
--   DROP COLUMN gender,
--   DROP COLUMN interests; 