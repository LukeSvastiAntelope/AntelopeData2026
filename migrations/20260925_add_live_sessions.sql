-- Live L1: Session + Participant core (event-type-agnostic spine).
-- Objects are Session / Participant — never candidate / voter.
-- Event-sourced: session_events is append-only; live views are projections.
-- Identified participants link to person_records (org-scoped). Profiles are for
-- segmentation + contact only — never static per-person scoring.

CREATE TABLE IF NOT EXISTS live_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  -- Short shareable join code (Mentimeter-style), globally unique
  code VARCHAR(16) NOT NULL,
  title VARCHAR(255) NOT NULL,
  host_name VARCHAR(255) NULL,
  event_type ENUM('expert_brief', 'town_hall', 'deliberation') NOT NULL DEFAULT 'expert_brief',
  identify_mode ENUM('identified', 'anonymous', 'per_question') NOT NULL DEFAULT 'identified',
  status ENUM('draft', 'live', 'ended') NOT NULL DEFAULT 'draft',
  -- Host-defined intake questions (DemographicField-compatible shape)
  intake_schema JSON NULL,
  -- Consent copy shown at join when identify_mode is not fully anonymous
  consent_text TEXT NULL,
  created_by INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  started_at TIMESTAMP NULL,
  ended_at TIMESTAMP NULL,
  UNIQUE KEY uq_live_sessions_code (code),
  KEY idx_live_sessions_org (organization_id),
  KEY idx_live_sessions_org_status (organization_id, status),
  KEY idx_live_sessions_created_by (created_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS session_participants (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  session_id BIGINT UNSIGNED NOT NULL,
  organization_id INT NOT NULL,
  person_record_id BIGINT UNSIGNED NULL,
  display_name VARCHAR(255) NULL,
  linkedin_url VARCHAR(512) NULL,
  -- Answers to host intake_schema
  intake JSON NULL,
  is_anonymous TINYINT(1) NOT NULL DEFAULT 0,
  -- Explicit consent recorded when identify_mode requires it
  consent_at TIMESTAMP NULL,
  joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_session_participants_session (session_id),
  KEY idx_session_participants_org (organization_id),
  KEY idx_session_participants_person (person_record_id),
  CONSTRAINT fk_session_participants_session
    FOREIGN KEY (session_id) REFERENCES live_sessions (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_session_participants_person
    FOREIGN KEY (person_record_id) REFERENCES person_records (id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS session_questions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  session_id BIGINT UNSIGNED NOT NULL,
  kind ENUM('poll', 'wordcloud', 'scale', 'open', 'qa') NOT NULL DEFAULT 'poll',
  prompt TEXT NOT NULL,
  options JSON NULL,
  -- NULL = inherit session.identify_mode; otherwise override per question
  identify_override ENUM('identified', 'anonymous') NULL,
  state ENUM('queued', 'active', 'closed') NOT NULL DEFAULT 'queued',
  order_idx INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_session_questions_session (session_id),
  KEY idx_session_questions_state (session_id, state),
  CONSTRAINT fk_session_questions_session
    FOREIGN KEY (session_id) REFERENCES live_sessions (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Append-only event log. Live tallies / screen views are projections over this.
CREATE TABLE IF NOT EXISTS session_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  session_id BIGINT UNSIGNED NOT NULL,
  organization_id INT NOT NULL,
  participant_id BIGINT UNSIGNED NULL,
  question_id BIGINT UNSIGNED NULL,
  type VARCHAR(64) NOT NULL,
  payload JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_session_events_session (session_id, id),
  KEY idx_session_events_org (organization_id),
  KEY idx_session_events_question (question_id),
  KEY idx_session_events_type (session_id, type),
  CONSTRAINT fk_session_events_session
    FOREIGN KEY (session_id) REFERENCES live_sessions (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_session_events_participant
    FOREIGN KEY (participant_id) REFERENCES session_participants (id)
    ON DELETE SET NULL,
  CONSTRAINT fk_session_events_question
    FOREIGN KEY (question_id) REFERENCES session_questions (id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
