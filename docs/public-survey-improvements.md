# Public Survey Improvements – Working Document

_Last updated: <!-- YYYY-MM-DD -->_

## Overview
This document tracks the enhancements planned for the public survey experience and related Digital Twin onboarding. Use it as the single source of truth so we don't lose track of scope, design decisions, or progress.

---

## Functional Requirements
1. **Responder Identification Modal**
   - Display a modal on the public survey landing page **before** any questions are shown.
   - Collect **Name** and **Email** (both required).
   - Persist the responder record and associate it with the survey response.

2. **Post-Submission Invitation**
   - After the survey is submitted, show a confirmation page that thanks the responder and invites them to enrich their new **Digital Twin**.
   - Provide a button or link that starts the Digital Twin sign-in process.

3. **Email Confirmation**
   - Send an email from **getantelope.com** to the responder's address.
   - Email should include:
     - A thank-you message.
     - A secure link to access their Digital Twin profile.
     - Basic next-steps / support information.

4. **Digital Twin Profile Page**
   - Lightweight profile page following the standard secure layout in `LAYOUT_PATTERN.md`.
   - Accessible by:
     - The responder (once authenticated).
     - The account that created the survey.
   - Displays basic twin details and allows future expansion (e.g., editing bio, adding demographics).

---

## Non-Functional Requirements
- **Security**: Ensure only the owner and authorized staff can view/edit a Digital Twin.
- **Accessibility**: All new UI elements must meet WCAG AA.
- **Performance**: Modal should load instantly; email should send within 3 seconds of submission.
- **Consistency**: All pages must use the layout pattern documented in `LAYOUT_PATTERN.md`.

---

## Acceptance Criteria
- [ ] Name/email modal appears and blocks survey until completed.
- [ ] Modal data is saved in the database with proper validation.
- [ ] Confirmation screen appears after submission with Digital Twin invite.
- [ ] Email is sent automatically, contains correct link, and is DMARC/SPF compliant.
- [ ] Digital Twin profile page loads for authenticated responder and survey owner.

---

## Task Breakdown
- [ ] **Database**: Create/extend tables for responder info and Digital Twin linkage.
- [ ] **API**: Endpoints to store responder data, send emails, and fetch Digital Twin info.
- [ ] **Public Survey UI**:
  - [ ] Implement modal component.
  - [ ] Integrate modal into survey flow.
- [ ] **Email Service**:
  - [ ] Template design.
  - [ ] Hook into survey submission pipeline.
- [ ] **Digital Twin Auth**:
  - [ ] Auth flow for new responders (OTP or magic-link).
  - [ ] Session management updates if necessary.
- [ ] **Digital Twin Profile Page**:
  - [ ] Route setup under `/digital-twins/[id]`.
  - [ ] Basic profile component.
  - [ ] Access control middleware.
- [ ] **QA & Testing**:
  - [ ] Unit tests for API logic.
  - [ ] E2E tests for survey → email → twin login flow.

---

## Dependencies / Integration Points
- Existing authentication system (NextAuth).
- Email provider configuration (currently SendGrid?).
- `LAYOUT_PATTERN.md` for consistent UI.

---

## Open Questions
1. What email provider and template engine will we standardize on?
2. Should the Digital Twin invitation require email verification (double opt-in)?
3. Do we need granular analytics on modal abandonment?

---

## References
- `LAYOUT_PATTERN.md` – Standard secure layout template.
- `SURVEY_IMPLEMENTATION_SUMMARY.md` – Current public survey implementation notes.
- [Feature Branch] `feature/surveys` – Active development branch for these changes. 