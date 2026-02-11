-- Add campaign/race context to organizations
-- Supports Model A: each org = one campaign for a specific race

ALTER TABLE organizations ADD COLUMN office_type ENUM(
  'federal_house', 'federal_senate', 'governor',
  'state_senate', 'state_house',
  'mayor', 'city_council', 'county',
  'president', 'other'
) NULL DEFAULT NULL;

ALTER TABLE organizations ADD COLUMN state CHAR(2) NULL DEFAULT NULL;
ALTER TABLE organizations ADD COLUMN district_code VARCHAR(20) NULL DEFAULT NULL;
ALTER TABLE organizations ADD COLUMN candidate_name VARCHAR(255) NULL DEFAULT NULL;
ALTER TABLE organizations ADD COLUMN party ENUM('D', 'R', 'I', 'L', 'G', 'O') NULL DEFAULT NULL;
ALTER TABLE organizations ADD COLUMN election_year SMALLINT NULL DEFAULT NULL;
