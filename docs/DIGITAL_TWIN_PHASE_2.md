### Digital Twin Phase 2 Implementation Plan

Reference: see `DIGITAL_TWIN_IMPLEMENTATION.md` for Phase 1 details

<CODE_REVIEW>
- Creation: Digital twins are created on survey submission (`POST /api/public/surveys/[slug]/submit`) and stored in MySQL (`responder_agents`) plus Pinecone with metadata including `createdBy`.
- Persona: Phase 1 generates persona principles and an embedding at submission time; updates occur on subsequent submissions or demographics edits.
- Query/search: Owner-scoped via `createdBy` metadata; public twin profile by token exists; responder survey history endpoint currently filters to creator-owned surveys only.
- Gaps for Phase 2: No unified, evolving “capability profile”; enrichment not event-driven; no per-survey matching/threshold deployment workflow; synthetic responses not separated with strong labeling; update route is public; responder-wide view across creators not yet implemented.
</CODE_REVIEW>

### 1. Objectives and Scope
- Evolving persona and capability profile for each twin, asynchronously updated with any new responder data.
- Enable survey creators to deploy twins as synthetic responders with match thresholds and quality controls.
- Clearly separate synthetic responses from human responses in storage and analytics.
- Maintain strict ownership, privacy, and anonymity rules.

### 2. Data Model Additions
- `responder_agents`
  - `persona_profile` JSON: { summary, core_traits[], communication_style, worldview, last_enriched_at, version }
  - `capability_map` JSON: { topics[], topic_confidence{}, question_type_proficiency{}, coverage_gaps[], freshness_score, data_sources_count }
  - `last_enriched_at` DATETIME
  - `persona_version` INT
- `survey_responses`
  - `response_origin` ENUM('human','digital_twin')
  - `agent_token` (already exists in some envs)
  - `twin_version` INT NULL
  - `twin_match_score` FLOAT NULL
- New (optional) tables
  - `enrichment_jobs`: id, agent_token, reason, status, attempts, error, created_at, started_at, finished_at, version_out
  - `synthetic_response_jobs`: id, survey_id, created_by, threshold, status, counts, created_at, finished_at
  - `survey_question_embeddings`: survey_id, question_id, embedding, model, updated_at
- `surveys`
  - `topic_tags` JSON (optional) for better matching context

### 3. Persona and Capability Profile
- Persona summary: short description, key traits, comms style, worldview.
- Capability map:
  - Topics/domains with confidence
  - Question-type proficiency: text, single-choice, multiple-choice, rating, yes-no, number
  - Coverage gaps and freshness
- Global vs per-creator views
  - Global sanitized persona/capabilities (no proprietary survey Q/A detail)
  - Per-creator augmentation: use only that creator’s surveys for additional signals

### 4. Asynchronous Enrichment
- Enrichment triggers:
  - On any survey submission for this agent
  - On demographics/profile edits
- Event/Job
  - Emit ::ENRICHMENT_REQUESTED:: with agent token, response id, survey id, anonymity level, createdBy
  - Worker aggregates safe-to-use history, regenerates persona/capabilities, re-embeds, increments `persona_version`, updates Pinecone and DB
  - Debounce (e.g., 2–5 minutes) and batch multiple events per agent
- Respect anonymity at source and aggregation layers

### 5. Matching and Quality Scoring
- Twin-level:
  - `profile_completion_score` (existing)
  - `enrichment_quality_score`: function of data_sources_count, freshness, topic breadth, answer diversity
- Survey-level relevance:
  - Precompute embeddings for survey description and questions
  - Compute per-twin match: similarity to survey + coverage of needed question types
  - Combined readiness score = f(relevance, enrichment_quality, completion, freshness)
- Explainability:
  - Reasons: top topic overlaps, recent enrichment, question-type coverage

### 6. Synthetic Response Generation
- Answer constraints by type:
  - Choice: valid option values only; allow “no answer” with low confidence
  - Text: persona-grounded, low temperature, optional length caps
- Output metadata per answer:
  - `confidence`, `rationale_short` (stored but not shown to respondents)
- Storage:
  - Save as `survey_responses` with `response_origin='digital_twin'`, `agent_token`, `twin_version`, `twin_match_score`

### 7. API Surface (non-breaking adds)
- Creator operations
  - `POST /api/surveys/{id}/twins/preview-matches` → list eligible twins with scores/reasons
  - `POST /api/surveys/{id}/twins/deploy` → start job to generate synthetic responses for twins above threshold
  - `GET /api/surveys/{id}/twins/deploy/{jobId}` → job status
- Scoring/Enrichment (internal/service)
  - `POST /api/digital-twins/enrich` → regenerate persona/capability (ownership-checked)
  - `POST /api/digital-twins/score-match` (batch scoring; internal)
- Responder view
  - `GET /api/digital-twin/{token}/responses/all` → all surveys answered by this twin across creators (secured via magic link or authenticated session tied to token)
- Hardening
  - Lock down `PATCH /api/digital-twin/[token]/update` (auth or signed magic link)

### 8. UI/UX
- Creator
  - Survey list/detail: “Deploy Twins” button; threshold slider; eligible count; preview table with scores and reasons; cost/time estimate; run job; status progress
  - Analytics: toggles to include/exclude synthetic; separate series and totals
- Responder
  - Digital twin profile page: persona summary, capabilities, last enriched, surveys across creators (secure access), “enrichment in progress” indicator
- Explorer
  - Show persona summary and capability bars; last updated; filter by readiness

### 9. Security, Privacy, Compliance
<SECURITY_REVIEW>
- Ownership: Only survey `createdBy` can preview/deploy twins to that survey. Always filter Pinecone by `createdBy`.
- Role trust: Do not trust `x-user-role` header; resolve role server-side from `x-user-id`.
- Anonymity: Apply `filterDemographicsForAnonymity` before any prompt/embedding; avoid PII in persona/capabilities/embeddings for semi/anonymous surveys.
- Public endpoints: Protect `PATCH /api/digital-twin/[token]/update`; implement time-limited, scoped magic links for responder access to cross-creator history.
- Synthetic labeling: Persist `response_origin='digital_twin'` and expose toggles in analytics/export. Prevent synthetic answers from affecting participation KPIs unless explicitly chosen.
- Abuse controls: Rate limit deploy & enrichment; per-day caps; audit logs: prompt hash, model, token, twin version, threshold, costs.
</SECURITY_REVIEW>

### 10. Operations and Observability
- Background jobs: idempotent jobs with retries/backoff; progress updates.
- Telemetry: queue depth, time-to-enrich, failures, deploy latency, cost tracking per job.
- Versioning: keep `persona_version`; store in responses for traceability; allow rollback.

### 11. Milestones with “small test” after each
- M1: Persona/Capability profile persisted and shown (read-only)
  - Test: After new response → `persona_version` increments; UI shows updated summary and capabilities.
- M2: Async enrichment pipeline
  - Test: Submit responses across two surveys → enrichment job runs once (debounced); `last_enriched_at` updates; Pinecone record updated.
- M3: Matching and scoring
  - Test: Preview matches for a survey; scores rank intuitively; reasons explain ranking.
- M4: Deploy workflow (dry-run)
  - Test: Threshold slider changes eligible set; dry-run shows counts/estimates; no writes.
- M5: Synthetic responses (write, label, analytics separation)
  - Test: Deploy to 10 twins; responses saved with `response_origin='digital_twin'`; analytics toggles reflect separation.
- M6: Responder-wide history
  - Test: Using secure token flow, responder sees all their surveys across creators; creator still only sees their own.
- M7: Hardening + Ops
  - Test: Update route requires auth or signed link; rate limits enforced; admin role checked server-side; audit logs present.

### 12. Risks and Mitigations
- Cost/latency: Batch embeddings; cache question embeddings; cap batch sizes.
- Drift/quality: Versioning with rollback; allow “no answer” for low confidence.
- Data leakage: Global vs per-creator enrichment separation; strict source filtering; consent.
- Bias: Show coverage diagnostics by cohort; allow threshold tuning.

### 13. Open Questions
- Consent model for global enrichment across creators?
- What minimum readiness threshold should be default per survey type?
- Do we need per-domain models or guardrails for sensitive surveys?

### Artifacts to Update
- Docs: this file; cross-link from `DIGITAL_TWIN_IMPLEMENTATION.md`.
- DB migrations for new fields/tables.
- Runbooks for enrichment/deploy jobs and failure handling.


