-- Volunteer V2: public signup intake schema + roster provenance on memberships.

ALTER TABLE organizations
  ADD COLUMN volunteer_signup_enabled TINYINT(1) NOT NULL DEFAULT 1
    COMMENT 'Public /join/<slug> volunteer signup on/off'
    AFTER description;

ALTER TABLE organizations
  ADD COLUMN volunteer_intake_schema JSON NULL
    COMMENT 'Host-defined intake fields for public volunteer signup'
    AFTER volunteer_signup_enabled;

ALTER TABLE organization_members
  ADD COLUMN volunteer_source VARCHAR(32) NULL
    COMMENT 'staff_invite | public_signup | site_form'
    AFTER person_record_id;

ALTER TABLE organization_members
  ADD COLUMN volunteer_intake JSON NULL
    COMMENT 'Answers from volunteer intake (org-scoped; not voter-file)'
    AFTER volunteer_source;

ALTER TABLE volunteer_magic_links
  ADD COLUMN source VARCHAR(32) NULL DEFAULT 'staff_invite'
    AFTER invited_by;

ALTER TABLE volunteer_magic_links
  ADD COLUMN intake JSON NULL
    AFTER source;
