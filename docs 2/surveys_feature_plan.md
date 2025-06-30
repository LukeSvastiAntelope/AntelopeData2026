# Survey & Digital-Twin Feature – Implementation Plan

> **Goal**: Enable interviewers to build Typeform-like surveys whose respondents are automatically converted into "Responder Agents" (digital twins) that can be queried later.

---

## 0. Ground Rules & Governance

| Item | Description |
|------|-------------|
| **Branch** | `feature/surveys` (long-lived feature branch) |
| **Feature Flag** | `NEXT_PUBLIC_ENABLE_SURVEYS` – _false_ by default on production |
| **Tech Stack** | Next.js 14 (App Router), TypeScript, Prisma (PostgreSQL), zod for validation, Jest & Playwright tests |
| **Security Baseline** | Re-use existing JWT middleware; add rate-limiting & CSRF for public submit routes |

---

## 1. Data Model (Prisma)

| Table | Key Fields |
|-------|------------|
| `Survey` | id, **title**, description, slug, createdBy, isPublic, createdAt |
| `SurveyQuestion` | id, surveyId (FK), **type** (text, single-choice, multi-choice, scale, etc.), prompt, options (JSON), `order` |
| `SurveyResponse` | id, surveyId (FK), responderId _(nullable)_, submittedAt, demographics (JSON) |
| `SurveyAnswer` | id, responseId (FK), questionId (FK), value (TEXT/JSON) |
| `ResponderAgent` | id, baseProfile (JSON), enrichmentStatus, createdFromResponseId (FK) |

Test: `npx prisma migrate dev` runs without errors and all FKs are enforced.

---

## 2. Backend API

| Endpoint | Method | Auth | Notes |
|----------|--------|------|-------|
| `/api/surveys` | POST | Secure | Create survey (creator) |
| `/api/surveys/:id` | GET | Public | Fetch survey definition |
| `/api/surveys/:id/submit` | POST | Public \* | Submit answers & demographics → returns `agentToken` |
| `/api/agents/:id/profile` | GET | Secure | Fetch digital-twin base profile |
| `/api/agents/:id/respond` | POST | Secure | Ask agent a question (LLM) |

\* Public routes must implement rate-limit + CSRF.

Test: Postman collection with happy-path + invalid payload cases (zod validation).

---

## 3. UI / Frontend

### 3.1 Creator Flow
1. Add new **Survey / Questionnaire** card on `/create` → `/create/survey` wizard.
2. Wizard pages:
   1. Survey meta (title, description, public/private)
   2. Question builder (drag-reorder, add types)
   3. AI-Assist: "Generate questions from prompt" (calls `/api/ai/generateSurvey`)
   4. Publish & share link (`/surveys/[slug]`)

### 3.2 Responder Flow
1. Public route `/surveys/[slug]` renders Typeform-style stepper.
2. Demographic block (name/age/sex/political etc.).
3. Validate locally → POST to `/submit`.
4. Thank-you screen shows optional "Save your twin link".

### 3.3 Dashboard Extensions
* _My Surveys_ list – results aggregation, export CSV.
* _Responder Agents_ list – filter by demographics, chat/ask sample question.

Test: Playwright E2E ‑ create survey → respond → see new agent.

---

## 4. Digital-Twin Logic

1. After submission, create `ResponderAgent` row seeded with answers.
2. **Persona generation**: background queue job that sends answers + demographics to OpenAI to generate `baseProfile` JSON _(political leaning, interests, etc.)_.
3. Store embeddings for semantic similarity (optional future).
4. Provide querying endpoint that takes a prompt, uses profile + answers as system context, and returns LLM output.

Test: Unit test persona prompt builder; integration test agent respond endpoint.

---

## 5. Non-Functional Requirements

* **Security**: no PII in logs; encrypt demographics column; rate-limit public POST.
* **Performance**: Cache survey definitions; queue long-running LLM tasks.
* **Compliance**: GDPR – include consent checkbox & delete-request endpoint.
* **Observability**: Add tracing to submission pipeline; dashboard metrics for submit rate.

---

## 6. Milestones & Timeline (T-shirt sizes)

| Sprint | Deliverable | Size |
|--------|-------------|------|
| 1 | Data model & migrations; POST `/api/surveys` & GET definitions | M |
| 2 | Public submit endpoint + digital-twin creation | L |
| 3 | Creator UI wizard (manual) | L |
| 4 | Responder UI (Typeform UX) | L |
| 5 | AI-Assist question generator | M |
| 6 | Persona enrichment worker + query endpoint | M |
| 7 | Dashboard analytics & export | M |
| 8 | Security hardening, load tests, docs | S |

---

## 7. Acceptance Criteria Checklist

- [ ] Creator can build & publish a survey.
- [ ] Public user can answer and is shown thank-you.
- [ ] Submission creates a `ResponderAgent` with basic persona.
- [ ] Creator can view aggregated results.
- [ ] Agents can be queried and return coherent answers.

---

## 8. Open Questions

1. Should unauthenticated responders receive a JWT or opaque token?
2. Minimum demographic schema? (Name optional?)
3. Which LLM provider & cost controls for persona/answers?
4. Consent & privacy wording – legal review needed.

---

_End of document_ 