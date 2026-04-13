# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
yarn dev          # Start Next.js dev server (localhost:3000)
yarn build        # Production build (uses 4GB Node memory limit)
yarn start        # Run production server
yarn lint         # Run ESLint

# Database migrations
node scripts/run-migration.js <filename.sql>   # Run a specific migration from /migrations/
# Example: node scripts/run-migration.js 20250201_add_channels_table.sql

# Scheduled tasks
yarn init-scheduler    # Initialize the daily cron scheduler
yarn cron:surveys      # Manually close expired surveys
```

There is no `setup-db` or `test` script. Database is set up by running migration files manually in order from `/migrations/`.

## Environment Variables

Required in `.env.local`:
- `AUTH_SECRET` — NextAuth secret (`openssl rand -base64 32`)
- `JWT_SECRET_KEY` — JWT signing secret
- `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`
- `NEXT_PUBLIC_APP_URL` — App URL (e.g., `http://localhost:3000`)

Optional (feature-gated):
- `ANTHROPIC_API_KEY` — Claude AI (survey analytics, digital twins)
- `OPENAI_API_KEY` — GPT models
- `PINECONE_API_KEY` — Vector embeddings
- `STRIPE_SECRET_KEY` — Payments
- `TELEGRAM_BOT_TOKEN` — Telegram channel integration
- `SENDGRID_API_KEY` — Email sending

## Architecture

AntelopeCM is a **political campaign management platform** built on Next.js 15 App Router with MySQL.

### Route Groups

- `src/app/(auth)/` — Public pages: login, register, verification
- `src/app/(secure)/` — Protected pages: surveys, digital-twins, dashboard, admin, voter-file, channels, team
- `src/app/api/` — ~32 serverless API routes

Middleware in `src/middleware.ts` gates all protected routes. It injects `x-user-id` and `x-user-email` headers into authenticated API requests — API routes read identity from these headers, not from re-parsing the session token.

### Data Access

All database access goes through two exports from `src/app/utils/database/db.ts`:
- `openSql()` / `getConnection()` — returns a shared MySQL connection pool (mysql2/promise)

Repository classes live in `src/app/utils/database/`:
- `UserRepo` — users and agent profiles
- `SurveyRepo` — surveys, questions, responses, answers
- `DemographicsRepo` — demographic customization
- `CohortRepo` — saved audience filters
- `ChannelRepo` — communication channel configs

### Services Layer

Business logic lives in `src/app/utils/services/`:
- `ai-service.ts` — Claude and OpenAI calls
- `digital-twin-service.ts` — twin creation/enrichment from survey responses
- `survey-analysis-engine.ts` — AI-powered analytics generation
- `report-generation-service.ts` — structured report production
- `campaign-memory-service.ts` — persistent memory per campaign
- `email-service.ts` — SendGrid integration

Survey-specific utilities are in `src/app/utils/survey/` (13 files covering analysis, import, question profiling, etc).

### Core Data Models

**Surveys** — `status`: `draft | active | scheduled | closed | stopped`; `anonymity_level`: `full | semi_anonymous | anonymous`; support cloning via `parent_survey_id`.

**Digital Twins (responder_agents)** — AI personas generated from survey responses. Identified by `agent_token`. Enriched with `persona_profile` and `capability_map`. Categorized as `full_profile | partial_profile | minimal_profile | imported_synthetic`.

**Organizations** — Multi-tenant. Members have roles: `owner | admin | analyst | viewer`. Surveys belong to an org.

**Cohorts** — Reusable audience filters stored as JSON, referenced by surveys and reports.

### Authentication

NextAuth 5.x with JWT strategy. Edge-safe config split: `src/auth.config.ts` (used in middleware) and `src/auth.ts` (full Node.js config with database providers). After login, the session user ID/email is forwarded by middleware as request headers.

### Page Layout Convention

All `(secure)` pages follow the pattern documented in `docs/LAYOUT_PATTERN.md`:

```jsx
<div className="flex-1 p-2 w-full bg-background">
  <div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg">
    <div className="px-6 py-4">
      <div className="flex items-center">
        <SidebarTrigger className="-ml-0.5 h-5 w-5 text-muted-foreground hover:text-foreground" />
        <div className="h-4 border-l border-border mx-4" />
        <h1 className="text-base font-medium text-card-foreground">Page Title</h1>
      </div>
    </div>
    <div className="border-b border-border" />
    <div className="p-6">{/* content */}</div>
  </div>
</div>
```

### Key Directories

| Path | Purpose |
|------|---------|
| `migrations/` | 44 SQL migration files — run manually in order |
| `scripts/` | 60+ Node.js utility/maintenance scripts |
| `docs/` | Architecture docs, setup guides, implementation plans |
| `src/app/utils/types/` | Shared TypeScript interfaces |
| `src/app/context/` | React context providers |
| `src/app/components/` | Page-level components |
| `src/components/ui/` | Shadcn/Radix UI primitives |

### AI Integration

The platform uses both Anthropic (Claude) and OpenAI APIs interchangeably via `ai-service.ts`. Pinecone is used for vector search on survey responses and report embeddings. Digital twin querying is publicly accessible at `/api/agents/query` and `/api/digital-twin/:id*`.
