# Surveys Upgrade Roadmap

_Last updated: 2025-07-01_

## Purpose
A single, always-up-to-date reference for the ongoing Survey & Digital-Twin improvements.  It captures priorities, design decisions, and implementation status so we never lose track as we iterate.

---

## High-Level Priorities (👍 = current focus)

| # | Priority | Status | Notes |
|---|----------|--------|-------|
| 1 | **Scheduling & Expiration** | ✅ Complete | Add `start_at`, `end_at`, automatic close, manual close/reopen |
| 2 | Demographic Templates & Config | 👍 In Progress | Creator chooses simple/advanced demographics |
| 3 | Publish Workflow & Versioning | ⬜ | Draft → review → publish, immutable snapshots |
| 4 | Security & Compliance Hardening | ⬜ | CSRF, rate-limits, encryption, GDPR erase |
| 5 | Advanced Analytics & Export | ⬜ | Cohort filters, CSV export |

> We tackle one slice at a time; when #1 ships we move the 👍 to #2 and so on.

---

## Detailed Task Board

### 1️⃣ Scheduling & Expiration
- [x] **DB**: add `start_at`, `end_at`, `archived_at`, extend `status` enum (draft \| scheduled \| active \| closed \| archived)
- [x] **CRON**: daily job flips `status` when `end_at < NOW()`
- [x] **API**:
  - [x] `POST /api/surveys/:id/close`
  - [x] `POST /api/surveys/:id/reopen`
- [x] **Middleware**: Public `/surveys/[slug]` returns **410 Gone** when not active
- [x] **UI**:
  - [x] Schedule picker in creator wizard step "Launch & Schedule"
  - [x] Badge "Ends in …" on dashboard
  - [x] Manual Close / Re-open buttons
- [ ] **Tests**: Jest unit for repo logic, Playwright E2E for expiration flow (deferred)

### 2️⃣ Demographic Templates & Config
- [ ] Tables: `demographic_templates`, `survey_demographics_config`, `survey_demographic_responses`
- [ ] Admin CRUD API for templates
- [ ] Creator API `GET/PUT /api/surveys/:id/demographics/config`
- [ ] **UI Creator**: configuration modal (simple/advanced)
- [ ] **UI Responder**: pre-survey modal for demographics + consent
- [ ] **Analytics**: extend dashboard charts with demographic filters

### 3️⃣ Publish Workflow & Versioning
- [ ] Add `version` column or snapshot table
- [ ] PUT edits create new draft; publish copies to live
- [ ] Audit trail table `survey_change_log`

### 4️⃣ Security & Compliance
- [ ] CSRF tokens on public submit routes
- [ ] IP + UID rate limiting `survey_submit:*`
- [ ] Encrypt `demographics` JSON (AES-GCM)
- [ ] GDPR endpoints `/erase` & background TTL job

### 5️⃣ Advanced Analytics & Export
- [ ] Server-side aggregation queries
- [ ] CSV/JSON export with anonymization options
- [ ] Cross-tab UI component (demographic × response)

---

## Reference Material
- `docs/surveys_feature_plan.md`
- `docs/demographics-customization-plan.md`
- `docs/public-survey-improvements.md`

Feel free to append questions, decisions, or meeting notes below this line.

---

### Changelog
- **2025-06-27** – Document created
- **2025-06-27** – Completed Priority 1: Scheduling & Expiration
- **2025-07-01** – Focus moved to Priority 2: Demographic Templates & Config 