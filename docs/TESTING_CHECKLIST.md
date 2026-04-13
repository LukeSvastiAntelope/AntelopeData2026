# E2E Manual Testing Guide — AntelopeCM

---

## Phase 0: Credentials to Request from Owner

Gather these before starting. None are committed to the repo.

| Credential | Used For | How to Get |
|---|---|---|
| `MYSQL_HOST/PORT/USER/PASSWORD/DATABASE` | All DB operations | Ask owner |
| `AUTH_SECRET` | NextAuth session signing | Ask owner OR run: `openssl rand -base64 32` |
| `JWT_SECRET_KEY` | JWT tokens | Ask owner |
| `ANTHROPIC_API_KEY` | AI analytics, digital twins, reports | Ask owner |
| `OPENAI_API_KEY` | Survey generation, avatar enrichment | Ask owner |
| `PINECONE_API_KEY` | Twin semantic search | Ask owner |
| `SENDGRID_API_KEY` | Email verification, password reset | Ask owner |
| `TELEGRAM_BOT_TOKEN` | Telegram channel integration | Ask owner (optional) |
| `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` | Payments | Ask owner (optional) |

---

## Phase 1: Environment Setup

### 1.1 Fill in `.env.local`

The file `AntelopeCM/.env.local` has been created with placeholder values.
Open it and replace every `<ask owner>` value with the real credentials.

### 1.2 Run Database Migrations

From the `AntelopeCM/` directory, run all 44 migrations in chronological order:

```bash
cd AntelopeCM

node scripts/run-migration.js 20240614_create_cohorts_table.sql
node scripts/run-migration.js 20240614_add_demographic_columns.sql
node scripts/run-migration.js 20240714_add_answer_code_to_survey_answers.sql
node scripts/run-migration.js 20250122_add_analytics_system.sql
node scripts/run-migration.js 20250122_add_demographics_customization.sql
node scripts/run-migration.js 20250122_add_ethnicity_demographic.sql
node scripts/run-migration.js 20250122_add_survey_cloning_support.sql
node scripts/run-migration.js 20250122_add_survey_source_tracking.sql
node scripts/run-migration.js 20250123_add_report_generation_tables.sql
node scripts/run-migration.js 20250123_add_survey_id_to_cohorts.sql
node scripts/run-migration.js 20250125_add_survey_anonymity_system.sql
node scripts/run-migration.js 20250125_add_survey_anonymity_system_v2.sql
node scripts/run-migration.js 20250125_add_survey_anonymity_system_safe.sql
node scripts/run-migration.js 20250127_email_migration.sql
node scripts/run-migration.js 20250127_fix_anonymous_profile_enum.sql
node scripts/run-migration.js 20250128_normalize_demographic_fields.sql
node scripts/run-migration.js 20250131_add_stopped_status.sql
node scripts/run-migration.js 20250131_update_survey_status_model.sql
node scripts/run-migration.js 20250201_add_channels_tables.sql
node scripts/run-migration.js 20250201_create_conversations_table.sql
node scripts/run-migration.js 20250201_add_conversation_type.sql
node scripts/run-migration.js 20250208_add_organizations.sql
node scripts/run-migration.js 20250208_add_tracking_polls.sql
node scripts/run-migration.js 20250208_add_voter_file_enrichment.sql
node scripts/run-migration.js 20250209_add_org_location.sql
node scripts/run-migration.js 20250210_add_political_data.sql
node scripts/run-migration.js 20250211_add_campaign_fields.sql
node scripts/run-migration.js 20250701_add_schedule_fields.sql
node scripts/run-migration.js 20250701_add_schedule_fields_safe.sql
node scripts/run-migration.js 20250713_add_indexes.sql
node scripts/run-migration.js 20250715_create_survey_question_stats.sql
node scripts/run-migration.js 20250811_add_twin_persona_capabilities.sql
node scripts/run-migration.js 20260212_add_campaign_news_digest.sql
node scripts/run-migration.js 20260212_add_last_news_seen_at_to_users.sql
node scripts/run-migration.js 20260212_add_political_data_district_demographics.sql
node scripts/run-migration.js 20260213_add_news_conversation_type.sql
node scripts/run-migration.js 20260221_add_campaign_memory_tables.sql
node scripts/run-migration.js 20260222_add_agent_situation_documents.sql
node scripts/run-migration.js 20260309_add_dashboard_automations.sql
node scripts/run-migration.js 20260318_add_dashboard_map_overlays.sql
node scripts/run-migration.js add_agent_token_to_survey_responses.sql
node scripts/run-migration.js fix_sort_memory_issue.sql
```

### 1.3 Start Dev Server

```bash
yarn dev
# → http://localhost:3000
```

---

## Phase 2: Feature-by-Feature Flows

---

### Flow 1: Authentication

**Minimum requirements:** MySQL + `SENDGRID_API_KEY`

1. Go to `http://localhost:3000/register`
2. Fill in email, password, display name → Submit
3. Check email for verification link → Click it
4. Confirm redirect to `/setup-profile`
5. Fill in profile details → Save
6. Go to `/login` → log in with the new account
7. Confirm redirect to `/surveys`
8. Test logout
9. Test "Forgot Password": request reset email → click link → enter new password → log in again

**Verify:**
- [ ] Session persists on page refresh
- [ ] `/surveys`, `/admin` redirect to `/login` when logged out
- [ ] Network tab → any authenticated API call has `x-user-id` request header

---

### Flow 2: Survey Lifecycle

**Minimum requirements:** MySQL
**For AI analytics step:** + `ANTHROPIC_API_KEY`

#### 2A — Create a Survey

1. Go to `/create/survey`
2. Choose "Start from scratch"
3. Title: `Test Survey 2026`, add description, set to Public
4. Add one question of each type:
   - Text: "What is your name?"
   - Single-choice: "What party do you affiliate with?" (Democrat / Republican / Independent)
   - Multiple-choice: "What issues matter most?" (Economy / Healthcare / Education / Immigration)
   - Rating 1-5: "How would you rate the candidate?"
   - Yes/No: "Are you a registered voter?"
5. Save as Draft → verify `/surveys` shows "draft" badge
6. Click Publish → verify status changes to "active"

- [ ] Draft saved correctly
- [ ] Status transitions to active after publish

#### 2B — Collect Responses

1. From survey list, copy the public URL (`/public/surveys/[slug]`)
2. Open in incognito window
3. Fill in demographic info if prompted
4. Answer all questions → Submit
5. Repeat 3–4 times with different answers

- [ ] Submissions succeed without login
- [ ] Each submission creates a unique response record

#### 2C — View Results

1. Go to `/surveys/[id]/results`
2. Verify all responses appear
3. Click an individual response → verify all answers visible
4. Go to `/surveys/[id]/analytics` → generate AI analytics (needs `ANTHROPIC_API_KEY`)
5. Export CSV → open file, verify all responses and columns present

- [ ] All responses visible
- [ ] AI analytics generates without error
- [ ] CSV export contains correct data

#### 2D — Status Transitions

- [ ] Close survey → status shows "closed"
- [ ] Reopen → status returns to "active"
- [ ] Stop → status shows "stopped"
- [ ] Clone → new survey appears with "(copy)" suffix

---

### Flow 3: Digital Twins

**Minimum requirements:** MySQL + `ANTHROPIC_API_KEY` + `OPENAI_API_KEY` + `PINECONE_API_KEY`
**Prerequisite:** 5+ survey responses from Flow 2B

1. Go to `/surveys/[id]/twins`
2. Click "Generate Digital Twins" → wait for processing
3. Navigate to `/digital-twins`
4. Verify profiles appear with demographics and age distribution chart
5. Search: "registered voter who cares about healthcare" → verify relevant profiles returned
6. Click a twin's profile
7. Ask: "What would convince you to vote for a new candidate?"
8. Verify the AI response reflects the twin's demographic profile

- [ ] Twins generated without error
- [ ] Semantic search returns relevant results
- [ ] Twin responses are contextually coherent

---

### Flow 4: Voter File Import

**Minimum requirements:** MySQL only

Prepare a CSV with columns: `first_name, last_name, address, city, state, zip, phone, party`

1. Go to `/voter-file`
2. Upload the CSV via drag-and-drop
3. Step 2: Review auto-detected column mapping — verify confidence scores
4. Adjust any incorrect mappings manually
5. Step 3: Click "Execute Import"
6. Step 4: Verify matched/enriched/skipped counts

- [ ] Column mapping auto-detected correctly
- [ ] Import completes with accurate counts
- [ ] Skipped rows have a reason shown

---

### Flow 5: Dashboard & Map Analysis

**Minimum requirements:** MySQL + political data loaded (from migrations)

1. Go to `/dashboard`
2. Verify district intelligence panel loads (PVI, margins, demographics)
3. Click "Custom Map" tab
4. Draw a polygon on the map
5. Click "Analyze" → verify voter counts and demographics for the region appear
6. Check "Political Alignment" charts for data

- [ ] District panel loads without error
- [ ] Polygon draw triggers analysis
- [ ] Results show voter/demographic breakdown

---

### Flow 6: Channels (Telegram)

**Minimum requirements:** `TELEGRAM_BOT_TOKEN`

1. Go to `/channels`
2. Find Telegram → click "Set up"
3. Enter bot token → click Connect
4. Verify status shows "Connected"
5. Go to a survey → Distribution tab → enable Telegram distribution
6. Message your Telegram bot → survey link should be sent
7. Complete survey via Telegram → verify response appears in results

- [ ] Bot connects successfully
- [ ] Survey distributed via Telegram
- [ ] Response from Telegram visible in results

---

### Flow 7: Admin Panel

**Minimum requirements:** MySQL + admin role
**Setup:** Set `role = 'admin'` in `users` table for your test user

1. Log in as admin user
2. Go to `/admin`
3. Users tab: all users listed, search by email works
4. Surveys tab: all platform surveys visible
5. Check platform stats (user count, survey count, response count, twin count)
6. Scheduler tab: verify stats visible, trigger a job manually
7. Create a throwaway user → delete it from admin panel

- [ ] Admin panel accessible only to admin role
- [ ] User search works
- [ ] Platform stats are accurate
- [ ] Manual job trigger runs without error

---

### Flow 8: Reports

**Minimum requirements:** MySQL + `ANTHROPIC_API_KEY`
**Prerequisite:** A survey with responses

1. Go to survey analytics
2. Click "Generate Report"
3. Monitor `/reports` → new entry appears with "generating" status
4. Wait for completion → status changes to "ready"
5. Open report → verify structured sections: summary, findings, recommendations

- [ ] Report generation starts without error
- [ ] Status transitions from generating → ready
- [ ] Report content is structured and coherent

---

## Phase 3: Sign-off Checklist

- [ ] Register → verify email → login flow works end-to-end
- [ ] Survey can be created, published, responded to, and closed
- [ ] AI analytics generates real insights (not error state)
- [ ] Digital twins are created and answer questions coherently
- [ ] Voter file import matches and enriches records correctly
- [ ] Admin can see all users and surveys
- [ ] Dashboard map analysis returns data for a drawn polygon
- [ ] Protected pages return 401/redirect when logged out

---

## Known Gaps — Not Testable Without Credentials

| Feature | Blocker |
|---|---|
| Email verification & password reset | `SENDGRID_API_KEY` |
| AI analytics, twin generation, report generation | `ANTHROPIC_API_KEY` + `OPENAI_API_KEY` |
| Twin semantic search | `PINECONE_API_KEY` |
| Telegram distribution | `TELEGRAM_BOT_TOKEN` |
| Payments / Stripe webhook | `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` |
| Google Sheets survey import | `GOOGLE_SHEETS_API_KEY` (ask owner — not in CLAUDE.md) |

---

## Bug Reporting Template

```
Title:
Severity: Critical / High / Medium / Low

Steps to Reproduce:
1.
2.
3.

Expected:
Actual:
Browser / Device:
Screenshots:
Notes:
```

## Notes
On custom create survery, bring down add question down so the user doesn't need to scroll up to add a question
we need coniditional forms not just simple q&a.
UI needs significant improvement. The survery creation is overwhelming even for a techinical person. Our audience is non technical