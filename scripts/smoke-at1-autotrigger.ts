/**
 * AT1 smoke — enable auto-trigger, cross threshold once, assert event + idempotency.
 * Uses skipChain so we don't call Claude in CI/smoke.
 *
 *   npx tsx --tsconfig tsconfig.json -r dotenv/config scripts/smoke-at1-autotrigger.ts
 */

import { openSql, closePool } from '../src/app/utils/database/db';
import { SurveyAutotriggerRepo } from '../src/app/utils/database/survey-autotrigger-repo';
import {
  maybeFireSurveyAutotrigger,
  pollSurveyAutotriggers,
} from '../src/app/utils/services/autotrigger-service';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';

require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const db = await openSql();
  const tag = `at1_${Date.now()}`;

  // Owner user for the survey
  const [users] = await db.execute<RowDataPacket[]>(
    `SELECT id FROM users ORDER BY id ASC LIMIT 1`
  );
  assert(users[0]?.id != null, 'need at least one user');
  const userId = Number(users[0].id);

  const [orgs] = await db.execute<RowDataPacket[]>(
    `SELECT id FROM organizations ORDER BY id ASC LIMIT 1`
  );
  const orgId = orgs[0]?.id != null ? Number(orgs[0].id) : null;

  const [ins] = await db.execute<ResultSetHeader>(
    `INSERT INTO surveys
      (title, description, slug, created_by, is_public, anonymity_level,
       demographics_required, status, organization_id)
     VALUES (?, 'AT1 smoke', ?, ?, 1, 'full', 0, 'published', ?)`,
    [`AT1 Smoke ${tag}`, `at1-smoke-${tag}`, userId, orgId]
  );
  const surveyId = Number(ins.insertId);
  assert(surveyId > 0, 'survey insert');

  const [qIns] = await db.execute<ResultSetHeader>(
    `INSERT INTO survey_questions (survey_id, type, prompt, options, is_required, question_order)
     VALUES (?, 'yes-no', 'Smoke Q?', NULL, 1, 1)`,
    [surveyId]
  );
  const questionId = Number(qIns.insertId);

  // Config: enabled, threshold 5 for faster smoke (brief default is 20)
  const cfg = await SurveyAutotriggerRepo.upsert(surveyId, {
    enabled: true,
    threshold: 5,
    actions: ['analytics', 'newsletter'],
    autonomy: 'propose',
  });
  assert(cfg.enabled && cfg.threshold === 5, 'config saved');

  // Seed 4 responses — below threshold
  for (let i = 0; i < 4; i++) {
    const [rr] = await db.execute<ResultSetHeader>(
      `INSERT INTO survey_responses (survey_id, demographics, anonymity_level, ip_address, user_agent)
       VALUES (?, '{}', 'full', '127.0.0.1', 'at1-smoke')`,
      [surveyId]
    );
    await db.execute(
      `INSERT INTO survey_answers (response_id, question_id, answer_value) VALUES (?, ?, 'yes')`,
      [rr.insertId, questionId]
    );
  }

  let r = await maybeFireSurveyAutotrigger(surveyId, {
    skipChain: true,
    source: 'smoke',
  });
  assert(!r.fired && r.skippedReason === 'below_threshold', 'should not fire below threshold');

  // 5th response — crosses band 1
  {
    const [rr] = await db.execute<ResultSetHeader>(
      `INSERT INTO survey_responses (survey_id, demographics, anonymity_level, ip_address, user_agent)
       VALUES (?, '{}', 'full', '127.0.0.1', 'at1-smoke')`,
      [surveyId]
    );
    await db.execute(
      `INSERT INTO survey_answers (response_id, question_id, answer_value) VALUES (?, ?, 'yes')`,
      [rr.insertId, questionId]
    );
  }

  r = await maybeFireSurveyAutotrigger(surveyId, { skipChain: true, source: 'smoke' });
  assert(r.fired === true, 'must fire on first crossing');
  assert(r.band === 1, 'band 1');
  assert(r.eventId != null && r.eventId > 0, 'event id');

  const events = await SurveyAutotriggerRepo.listEvents(surveyId, 10);
  assert(events.length >= 1, 'event logged');
  assert(events[0].eventType === 'autotrigger.fired', 'autotrigger.fired event');
  assert(events[0].responseCount === 5, 'event response count');

  // Idempotent — same band must not re-fire
  r = await maybeFireSurveyAutotrigger(surveyId, { skipChain: true, source: 'smoke' });
  assert(!r.fired && r.skippedReason === 'already_fired_this_band', 'no re-fire same band');

  // Jump to 10 — second band
  for (let i = 0; i < 5; i++) {
    const [rr] = await db.execute<ResultSetHeader>(
      `INSERT INTO survey_responses (survey_id, demographics, anonymity_level, ip_address, user_agent)
       VALUES (?, '{}', 'full', '127.0.0.1', 'at1-smoke')`,
      [surveyId]
    );
    await db.execute(
      `INSERT INTO survey_answers (response_id, question_id, answer_value) VALUES (?, ?, 'no')`,
      [rr.insertId, questionId]
    );
  }

  const poll = await pollSurveyAutotriggers({
    orgId: orgId ?? undefined,
    skipChain: true,
  });
  const hit = poll.results.find((x) => x.surveyId === surveyId && x.fired);
  assert(!!hit, 'scheduler backstop fires next band');
  assert(hit!.band === 2, 'band 2');

  const after = await SurveyAutotriggerRepo.getBySurveyId(surveyId);
  assert(after != null && after.firedCount === 2, `fired_count=2 got ${after?.firedCount}`);

  // Cleanup
  await db.execute(`DELETE FROM survey_autotrigger_events WHERE survey_id = ?`, [surveyId]);
  await db.execute(`DELETE FROM survey_autotrigger WHERE survey_id = ?`, [surveyId]);
  await db.execute(
    `DELETE FROM survey_answers WHERE response_id IN (SELECT id FROM survey_responses WHERE survey_id = ?)`,
    [surveyId]
  );
  await db.execute(`DELETE FROM survey_responses WHERE survey_id = ?`, [surveyId]);
  await db.execute(`DELETE FROM survey_questions WHERE survey_id = ?`, [surveyId]);
  await db.execute(`DELETE FROM surveys WHERE id = ?`, [surveyId]);

  console.log(
    `PASS: AT1 — threshold fire once + event + idempotent skip + scheduler band-2 (survey cleaned)`
  );
}

main()
  .catch((e) => {
    console.error('FAIL', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool().catch(() => undefined);
  });
