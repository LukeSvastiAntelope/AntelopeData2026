-- G4 design affordances (no mobile client) — offline sync hooks for canvass_contacts
-- Append-only trail must support client timestamps + idempotent retry without conflict.

ALTER TABLE canvass_contacts
  ADD COLUMN client_event_id VARCHAR(64) NULL AFTER survey_response_id,
  ADD UNIQUE KEY uq_canvass_client_event (organization_id, client_event_id),
  ADD KEY idx_canvass_org_recorded (organization_id, recorded_at, id),
  ADD KEY idx_canvass_canvasser_recorded (canvasser_id, recorded_at, id);
