# Antelope Politico — Platform Features

> Political survey intelligence, voter modeling, and campaign operations platform.

**Last updated:** February 8, 2026
**Branch:** `politico`

---

## Table of Contents

1. [Overview](#overview)
2. [Core Concepts](#core-concepts)
3. [Survey Management](#survey-management)
4. [Voter Profiles (Digital Twins)](#voter-profiles-digital-twins)
5. [Cohort Analysis & Chat](#cohort-analysis--chat)
6. [A/B Message Testing](#ab-message-testing)
7. [Tracking Polls](#tracking-polls)
8. [Election Predictions](#election-predictions)
9. [Geographic Intelligence](#geographic-intelligence)
10. [Voter File Import](#voter-file-import)
11. [Survey Distribution & Field Operations](#survey-distribution--field-operations)
12. [Channels (Telegram)](#channels-telegram)
13. [Reports](#reports)
14. [Python Analysis](#python-analysis)
15. [Team & Organizations](#team--organizations)
16. [Authentication & Accounts](#authentication--accounts)
17. [Admin Tools](#admin-tools)
18. [API Reference (Key Endpoints)](#api-reference-key-endpoints)
19. [Database Schema (Key Tables & Migrations)](#database-schema-key-tables--migrations)
20. [Environment Variables](#environment-variables)

---

## Overview

Antelope Politico is a full-stack Next.js application (App Router) for political survey research, voter modeling, and campaign intelligence. It combines:

- **Survey creation & distribution** — build, publish, and collect responses at scale
- **AI-powered voter profiles** — synthetic personas generated from real survey data, stored in Pinecone
- **Cohort analysis** — natural-language querying of voter segments with AI
- **Predictive modeling** — election outcome forecasting with likely-voter screens and Monte Carlo simulation
- **Field operations** — mobile canvassing, QR codes, SMS distribution
- **Team collaboration** — multi-user organizations with role-based access

**Tech stack:** Next.js 14+, React 18, TypeScript, Tailwind CSS, MySQL, Pinecone, OpenAI/Anthropic, NextAuth.js (JWT)

---

## Core Concepts

| Concept | Description |
|---|---|
| **Survey** | A set of questions distributed to respondents. Lifecycle: draft → scheduled → active → stopped. Has a unique slug for public access. |
| **Voter Profile** | An AI persona (digital twin) generated from a respondent's survey answers and demographics. Stored as a vector in Pinecone for semantic querying. |
| **Cohort** | A filtered subset of respondents defined by demographic or answer criteria. Can be queried with natural language via the cohort chat. |
| **Tracking Poll** | A series of survey "waves" (clones) linked by `parent_survey_id` for longitudinal trend analysis. |
| **Organization** | A team workspace with role-based access (owner, admin, analyst, viewer) for sharing surveys and activity. |

---

## Survey Management

### Pages

| Route | Description |
|---|---|
| `/surveys` | Survey dashboard — list all surveys with status, response counts, quick actions |
| `/create/survey` | Create a new survey — manual builder with political template quick-start |
| `/create/survey/ai` | AI-generated survey creation |
| `/create/survey/qualitative` | Qualitative/conversational survey creation |
| `/create/survey/quiz` | Quiz-style survey creation |
| `/surveys/import` | Import surveys from CSV, Excel, Typeform, SurveyMonkey, Google Sheets |
| `/surveys/[id]/edit` | Edit survey questions, settings, anonymity level |
| `/surveys/[id]/analytics` | Response analytics dashboard |
| `/surveys/[id]/results` | Individual response viewer |
| `/surveys/[id]/results/[responseId]` | Single response detail |
| `/surveys/[id]/twins` | Voter profile deployment for a survey |

### Features

- **Political survey templates** — 6 pre-built templates: Voter Sentiment Poll, Candidate Comparison, Issue Priority Survey, Message Testing, Post-Event/Debate Poll, District Pulse Check (`src/app/utils/political-survey-templates.ts`)
- **Survey lifecycle** — draft, scheduled (with cron auto-start/stop), active, stopped
- **Anonymity levels** — full identity, semi-anonymous, anonymous, political (custom field set optimized for voter research)
- **Political demographic fields** — party affiliation, voter registration status, voting frequency, primary participation, congressional district, state, county, ideology spectrum, issue priorities, news sources (`src/app/utils/demographic-system-v2.ts`)
- **Import infrastructure** — chunked file upload for large CSVs/Excel, column auto-detection, demographic matching, codebook parsing for research data
- **Survey cloning** — duplicate any survey for iteration
- **CSV/codebook export** — download responses or survey schema
- **Public survey form** — accessible at `/survey/[slug]` with progressive demographic collection
- **Qualitative mode** — AI-guided conversational surveys with real-time probing

---

## Voter Profiles (Digital Twins)

### Pages

| Route | Description |
|---|---|
| `/digital-twins` | Browse all voter profiles with search and filtering |
| `/digital-twins/[id]` | Individual voter profile detail — demographics, survey history, AI persona |

### How It Works

1. When a respondent submits a survey, their answers and demographics are processed by `DigitalTwinService`
2. AI generates a `PersonaPrinciples` object (worldview, personality traits, communication style, interests)
3. The profile is embedded as a 1536-dimension vector and stored in Pinecone (`prediction-results` index)
4. Profiles accumulate data across multiple surveys — each new submission enriches the existing twin
5. Profiles can be enriched further via voter file import (see [Voter File Import](#voter-file-import))

### Key Service

`src/app/utils/services/digital-twin-service.ts` — `DigitalTwinService` with methods:
- `createDigitalTwin()` — generate new profile from survey data
- `updateDigitalTwin()` — enrich existing profile with new survey answers
- `storeInPinecone()` — vectorize and persist
- `generatePersonaPrinciples()` — AI persona generation

---

## Cohort Analysis & Chat

### Pages

| Route | Description |
|---|---|
| `/cohort-chat` | Cohort builder — define voter segments with filters, then chat with AI about them |
| `/cohort-chat/chat` | Full-screen AI chat interface for cohort analysis |

### Features

- **Natural-language querying** — ask questions like "What are swing voters most concerned about?" and get data-backed answers
- **Political AI analyst** — system prompt tuned for campaign intelligence: polling metrics, voter segment terminology, cross-tabs, net favorability, strategic recommendations
- **Voter segment presets** — 17 one-click segment filters organized by category:
  - **Engagement:** Likely Voters, Low-Propensity Voters, Primary Voters, New Registrants
  - **Partisan:** Base Democrats, Base Republicans, Independents, Cross-Party Voters, Third Party
  - **Demographic:** Young Voters (18-34), Senior Voters (65+), Suburban Women, Rural Voters, Urban Voters
  - **Persuadable:** Swing Voters, Moderate Persuadables, Issue-First Voters
- **Quantitative + qualitative analysis** — the system runs SQL queries and AI interpretation in parallel

---

## A/B Message Testing

### Pages

| Route | Description |
|---|---|
| `/surveys/[id]/message-test` | A/B message testing dashboard |

### API

`POST /api/surveys/[id]/message-test`

### How It Works

1. Enter 2+ message variants (e.g., campaign ads, email subject lines)
2. System retrieves voter profiles associated with the survey
3. AI simulates each profile's reaction to each message (sentiment + convincingness score)
4. Results dashboard shows:
   - Winner badge on the highest-performing message
   - Sentiment breakdown (positive/neutral/negative) per message
   - Convincing score distribution
   - Per-profile reaction details

---

## Tracking Polls

### Database

- `surveys.parent_survey_id` — links waves to the original survey
- `surveys.wave_number` — sequential wave identifier

### API

| Endpoint | Description |
|---|---|
| `POST /api/surveys/[id]/wave` | Create a new wave (clones the survey, increments wave number, links to parent) |
| `GET /api/surveys/[id]/wave` | List all waves in a tracking poll series |

### Usage

Create wave 1 as a normal survey. Use the wave API to create wave 2, 3, etc. Each wave is a full survey clone with linked `parent_survey_id`. The predictions dashboard can analyze trends across waves.

---

## Election Predictions

### Pages

| Route | Description |
|---|---|
| `/surveys/[id]/predictions` | Election prediction dashboard |

### API

`POST /api/surveys/[id]/predict`

### Modeling Engine

`src/app/utils/api/politicalModeling.ts` — `PoliticalModelingEngine`:

1. **Likely-voter screen** — filters respondents by `voting_frequency` (Every election / Most elections = likely voter)
2. **Turnout estimates** — historical rates by voting frequency and age bracket
3. **Monte Carlo simulation** — 10,000-iteration win probability calculation accounting for sampling error
4. **Segment breakdowns** — support levels across party, age, gender, ethnicity, education, state, voting frequency, ideology
5. **Key driver analysis** — identifies segments with the largest candidate gaps (high/medium/low impact)
6. **Tracking poll trends** — when `includeWaves` is true, produces per-wave comparison data

### Dashboard Features

- Win probability cards with "Leader" badge
- Likely voter vs. raw support comparison
- Margin of error display
- Segment breakdown table
- Tracking poll trend table with directional arrows
- Key driver cards (high/medium/low impact)
- Methodology disclosure

---

## Geographic Intelligence

### API

`GET /api/surveys/[id]/geo` — aggregates survey responses by state

### Component

`src/components/USStateMap.tsx` — tile-grid US state choropleth map. Accepts state data with counts/sentiment and color-codes states accordingly.

---

## Voter File Import

### Pages

| Route | Description |
|---|---|
| `/voter-file` | Voter file import wizard (upload, preview, map, execute) |

### API

| Endpoint | Description |
|---|---|
| `POST /api/voter-file/import` | Upload & preview — auto-detects format, maps columns, returns preview |
| `POST /api/voter-file/execute` | Execute import — matches rows to existing voter profiles, enriches demographics |

### Supported Formats

| Format | Provider | Signature Columns |
|---|---|---|
| **L2 Political** | L2 Inc. | `LALVOTERID`, `Voters_FIPS`, `Parties_Description` |
| **TargetSmart** | TargetSmart | `vb.voterbase_id`, `vb.tsmart_state`, `ts.tsmart_partisan_score` |
| **Generic State Roll** | Any state SOS | Fallback — matches common column names like `voter_id`, `party`, `first_name` |

### Matching Logic

1. **Email match** (95% confidence) — exact match on `responder_agents.email`
2. **Name + state match** (70% confidence) — fuzzy match on normalized name + state
3. **Name + ZIP match** (80% confidence) — fuzzy match on normalized name + ZIP code

### Data Flow

- Voter file values fill in blank demographic fields (don't overwrite existing data)
- Enrichment source metadata is stored in `survey_responses.enrichment_source` (JSON)
- External voter file IDs stored in `responder_agents.voter_file_id` for deduplication
- Value transforms normalize party codes (D→Democrat, R→Republican, etc.), registration status, gender, age ranges, and voting frequency

---

## Survey Distribution & Field Operations

### Pages

| Route | Description |
|---|---|
| `/surveys/[id]/distribute` | Distribution hub — links, QR codes, embed code, SMS |
| `/survey/[slug]` | Public survey form (standard) |
| `/survey/[slug]/canvass` | Public survey form (canvassing mode) |
| `/survey/[slug]/completed` | Survey closed page |

### Distribution Channels

| Channel | Description |
|---|---|
| **Direct Link** | Copy survey URL or canvass-mode URL |
| **QR Code** | Server-generated PNG QR code (standard or canvass mode), downloadable |
| **Embed** | iframe snippet for any website |
| **SMS** | Twilio integration for bulk SMS invitations (graceful fallback if not configured) |

### Canvassing Mode

Mobile-optimized survey variant (`/survey/[slug]/canvass`):

- One question at a time with large touch targets
- Progress bar
- GPS location capture (optional, automatic)
- "Next Respondent" quick-reset after submission
- Session response counter
- Minimal chrome for field use

### API

| Endpoint | Description |
|---|---|
| `GET /api/surveys/[id]/qr?mode=default\|canvass&format=png\|dataurl` | Generate QR code |
| `POST /api/surveys/[id]/sms` | Send SMS invitations (Twilio or fallback) |

---

## Channels (Telegram)

### Pages

| Route | Description |
|---|---|
| `/channels` | Channel management dashboard |
| `/channels/new` | Create a new channel |
| `/channels/telegram/setup` | Telegram bot setup |

### Features

- Telegram bot integration for survey distribution
- Per-survey channel enable/disable
- Conversation tracking

---

## Reports

### Pages

| Route | Description |
|---|---|
| `/reports` | Report list |
| `/reports/[id]` | Report detail/viewer |

### API

| Endpoint | Description |
|---|---|
| `GET/POST /api/reports` | List/create reports |
| `GET /api/reports/[id]` | Get report detail |
| `POST /api/reports/save` | Save report |
| `POST /api/reports/preview` | Preview report |

### Features

- AI-generated analytical reports from survey data
- Report storage and retrieval
- Status tracking (generating, ready, failed)

---

## Python Analysis

### Pages

| Route | Description |
|---|---|
| `/python-analysis` | Interactive Python analysis environment |

### API

| Endpoint | Description |
|---|---|
| `POST /api/python-analysis/generate-code` | Generate Python analysis code from survey data |
| `POST /api/python-analysis/generate-code-stream` | Streaming code generation |
| `POST /api/python-analysis/plan-steps` | AI plans multi-step analysis |
| `POST /api/python-analysis/generate-step-code` | Generate code for individual step |
| `POST /api/python-analysis/fix-code` | AI fixes broken analysis code |
| `POST /api/python-analysis/extract-insights` | Extract insights from results |
| `POST /api/python-analysis/synthesize` | Synthesize multi-step findings |
| `POST /api/python-analysis/process-codebook` | Process research codebooks |

### Features

- AI-powered Python code generation for statistical analysis
- Multi-step analysis planning and execution
- Automatic error fixing
- Insight extraction and synthesis
- Codebook-aware analysis for research data

---

## Team & Organizations

### Pages

| Route | Description |
|---|---|
| `/team` | Organization management — create orgs, invite members, view activity |

### API

| Endpoint | Description |
|---|---|
| `GET/POST /api/organizations` | List/create organizations |
| `GET /api/organizations/[id]` | Organization detail (members, surveys, activity) |
| `POST /api/organizations/[id]/members` | Invite members |

### Roles

| Role | Permissions |
|---|---|
| **Owner** | Full access, manage members, delete org |
| **Admin** | Manage surveys, invite members |
| **Analyst** | View surveys, run analysis, create reports |
| **Viewer** | Read-only access to shared surveys and reports |

### Database

- `organizations` — org name, slug, description
- `organization_members` — user-org link with role and status
- `organization_activity_log` — audit trail
- `surveys.organization_id` — links surveys to orgs

---

## Authentication & Accounts

### Routes

| Route | Description |
|---|---|
| `/` (auth page) | Landing page with login/signup |
| `/login` | Login |
| `/register` | Registration |
| `/profile` | User profile management |
| `/setup-profile` | First-time profile setup |
| `/logout` | Logout |
| `/about` | About Antelope Politico |

### Stack

- **NextAuth.js** with JWT strategy
- Credentials provider (email + password)
- Discord OAuth provider
- Middleware-protected routes (see `src/middleware.ts`)

---

## Admin Tools

### Pages

| Route | Description |
|---|---|
| `/admin` | Admin dashboard |
| `/admin/[id]` | Admin detail view |
| `/admin/scheduler` | Background job scheduler management |

### Features

- Survey management across all users
- Scheduler stats, config, and manual trigger
- Debug endpoints (migration runner, build info)

---

## API Reference (Key Endpoints)

### Surveys

| Method | Endpoint | Description |
|---|---|---|
| GET/POST | `/api/surveys` | List/create surveys |
| GET/PUT | `/api/surveys/[id]` | Get/update survey |
| POST | `/api/surveys/[id]/publish` | Publish survey |
| POST | `/api/surveys/[id]/close` | Close survey |
| POST | `/api/surveys/[id]/reopen` | Reopen closed survey |
| POST | `/api/surveys/[id]/clone` | Clone survey |
| DELETE | `/api/surveys/[id]/delete` | Delete survey |
| GET | `/api/surveys/[id]/analytics` | Survey analytics |
| GET | `/api/surveys/[id]/stats` | Survey stats |
| GET | `/api/surveys/[id]/responses` | List responses |
| GET | `/api/surveys/[id]/export-csv` | Export CSV |
| POST | `/api/surveys/[id]/campaign` | Campaign management |

### Political Features

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/surveys/[id]/predict` | Run election prediction model |
| POST | `/api/surveys/[id]/message-test` | A/B message testing |
| GET | `/api/surveys/[id]/geo` | Geographic aggregation |
| POST/GET | `/api/surveys/[id]/wave` | Tracking poll wave management |
| GET | `/api/surveys/[id]/qr` | QR code generation |
| POST | `/api/surveys/[id]/sms` | SMS distribution |

### Voter Files

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/voter-file/import` | Upload & preview voter file |
| POST | `/api/voter-file/execute` | Execute voter file import |

### Public

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/public/surveys/[slug]` | Get public survey |
| POST | `/api/public/surveys/[slug]/submit` | Submit response |
| GET | `/api/public/surveys/[slug]/status` | Check survey status |

---

## Database Schema (Key Tables & Migrations)

### Core Tables

| Table | Description |
|---|---|
| `surveys` | Survey definitions (title, description, slug, status, anonymity, schedule, parent_survey_id, wave_number, organization_id) |
| `survey_questions` | Questions belonging to surveys |
| `survey_responses` | Respondent submissions (demographics JSON, answers JSON, enrichment_source JSON) |
| `responder_agents` | Respondent identity records (name, email, agent_token, voter_file_id) |
| `cohorts` | Saved cohort definitions |
| `organizations` | Team organizations |
| `organization_members` | Org membership with roles |
| `organization_activity_log` | Org audit trail |

### Phase 4 Migrations

| File | Changes |
|---|---|
| `20250208_add_tracking_polls.sql` | Add `parent_survey_id`, `wave_number` to surveys |
| `20250208_add_organizations.sql` | Create organizations, org_members, activity_log tables |
| `20250208_add_voter_file_enrichment.sql` | Add `enrichment_source` to survey_responses, `voter_file_id` to responder_agents |

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `MYSQL_HOST` | Yes | MySQL hostname |
| `MYSQL_PORT` | No | MySQL port (default 3306) |
| `MYSQL_USER` | Yes | MySQL username |
| `MYSQL_PASSWORD` | Yes | MySQL password |
| `MYSQL_DATABASE` | Yes | MySQL database name |
| `NEXTAUTH_SECRET` | Yes | NextAuth JWT secret |
| `NEXTAUTH_URL` | Yes | Application base URL |
| `NEXT_PUBLIC_APP_URL` | No | Public-facing URL (used for QR codes, SMS links) |
| `OPENAI_API_KEY` | Yes | OpenAI API key (voter profiles, analysis) |
| `ANTHROPIC_API_KEY` | No | Anthropic API key (alternative AI provider) |
| `PINECONE_API_KEY` | Yes | Pinecone API key (voter profile vectors) |
| `PINECONE_ENVIRONMENT` | Yes | Pinecone environment |
| `SERPAPI_API_KEY` | No | SerpAPI key (news gathering for predictions) |
| `TWILIO_ACCOUNT_SID` | No | Twilio SID (SMS distribution — optional) |
| `TWILIO_AUTH_TOKEN` | No | Twilio auth token |
| `TWILIO_PHONE_NUMBER` | No | Twilio sender phone number |

---

## Sidebar Navigation

The main sidebar (`src/components/app-sidebar.tsx`) contains:

1. **Surveys** — `/surveys`
2. **Voter Profiles** — `/digital-twins`
3. **Channels** — `/channels`
4. **Reports** — `/reports`
5. **Python Analysis** — `/python-analysis`
6. **Voter Files** — `/voter-file`
7. **Team** — `/team`

Footer: About Us, Community (Telegram), Logout

---

## Development Notes

- **Branch:** All politico features are on the `politico` branch
- **Server Components:** Used by default; `'use client'` only where interactivity requires it
- **Database:** MySQL with raw queries via `mysql2/promise` pool (`src/app/utils/database/db.ts`)
- **Vectors:** Pinecone `prediction-results` index, 1536-dimension embeddings (OpenAI `text-embedding-ada-002`)
- **AI Models:** Configurable per agent — supports OpenAI GPT-4 and Anthropic Claude
- **File imports:** Chunked upload for large files, Papa Parse for CSV, SheetJS for Excel
- **Middleware:** `src/middleware.ts` protects all secure routes, enforces auth via NextAuth session
