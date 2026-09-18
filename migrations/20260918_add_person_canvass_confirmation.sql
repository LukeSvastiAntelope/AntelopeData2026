-- D3: In-person canvass confirmation fields on unified person records

ALTER TABLE person_records
  ADD COLUMN canvass_status VARCHAR(32) NULL
    COMMENT 'not_contacted|contacted|confirmed|not_home|refused|moved|wrong_address'
    AFTER match_confidence;

ALTER TABLE person_records
  ADD COLUMN canvass_party VARCHAR(64) NULL
    COMMENT 'Party as confirmed at the door (overrides display lean when set)'
    AFTER canvass_status;

ALTER TABLE person_records
  ADD COLUMN canvass_notes VARCHAR(512) NULL AFTER canvass_party;

ALTER TABLE person_records
  ADD COLUMN canvass_confirmed_at TIMESTAMP NULL AFTER canvass_notes;

ALTER TABLE person_records
  ADD COLUMN canvass_by_user_id INT NULL AFTER canvass_confirmed_at;

CREATE INDEX idx_person_canvass_status ON person_records (canvass_status);
