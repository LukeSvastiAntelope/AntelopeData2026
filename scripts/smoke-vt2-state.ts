/**
 * VT2 smoke — seed multi-touchpoint history, assert voterState shows
 * current values + change summaries (never overwritten).
 *
 *   npx tsx --tsconfig tsconfig.json -r dotenv/config scripts/smoke-vt2-state.ts
 */

import { openSql, closePool } from '../src/app/utils/database/db';
import { voterState, voterStateFromTimeline } from '../src/app/utils/services/voter-state';
import type { TimelineEvent } from '../src/app/utils/services/voter-timeline';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';

require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  // ── Pure unit: change tracking from a synthetic timeline ────────────
  const synthetic: TimelineEvent[] = [
    {
      ts: '2026-07-15T12:00:00.000Z',
      source: 'survey_responses',
      type: 'survey.response',
      summary: 'Jul survey',
      payload: {
        responseId: 1,
        surveyId: 10,
        surveyTitle: 'Jul pulse',
        answers: [
          {
            questionId: 1,
            prompt: 'Public security',
            answerValue: 'neutral',
            answerCode: null,
          },
        ],
      },
    },
    {
      ts: '2026-09-10T12:00:00.000Z',
      source: 'survey_responses',
      type: 'survey.response',
      summary: 'Sep survey',
      payload: {
        responseId: 2,
        surveyId: 11,
        surveyTitle: 'Sep pulse',
        answers: [
          {
            questionId: 2,
            prompt: 'Public security',
            answerValue: 'major concern',
            answerCode: null,
          },
        ],
      },
    },
    {
      ts: '2026-08-01T12:00:00.000Z',
      source: 'canvass_contacts',
      type: 'canvass.contact',
      summary: 'door',
      payload: { status: 'undecided', party: 'Independent' },
    },
    {
      ts: '2026-09-01T12:00:00.000Z',
      source: 'person_records',
      type: 'canvass.confirmation',
      summary: 'confirm',
      payload: { status: 'supporter', party: 'Democrat' },
    },
    {
      ts: '2026-08-15T12:00:00.000Z',
      source: 'fundraising',
      type: 'fundraising.capture',
      summary: 'gift',
      payload: {
        sourceName: 'donor_list_import',
        payload: { raw: { amount: 25 } },
      },
    },
    {
      ts: '2026-07-20T12:00:00.000Z',
      source: 'survey_optins',
      type: 'optin.signup',
      summary: 'optin',
      payload: { consent: true, surveySlug: 'jul-pulse' },
    },
    {
      ts: '2026-09-12T12:00:00.000Z',
      source: 'contact_suppression',
      type: 'contact.suppression',
      summary: 'dnc',
      payload: { reason: 'do_not_contact', source: 'manual' },
    },
  ];

  const pure = voterStateFromTimeline(42, synthetic);
  const issue = pure.issuePositions.find((a) => a.label === 'Public security');
  assert(!!issue, 'issue Public security');
  assert(issue!.current === 'major concern', `current=${issue!.current}`);
  assert(issue!.history.length === 2, `issue history ${issue!.history.length}`);
  assert(
    !!issue!.changeSummary &&
      issue!.changeSummary.includes('major concern') &&
      issue!.changeSummary.includes('neutral'),
    `bad changeSummary: ${issue!.changeSummary}`
  );
  assert(pure.partisanship?.current === 'Democrat', 'partisanship current');
  assert(
    (pure.partisanship?.history.length || 0) >= 2,
    'partisanship history'
  );
  assert(pure.donationStatus?.current === 'donor (25)', 'donation');
  assert(
    pure.engagement?.current === 'suppressed:do_not_contact',
    `engagement=${pure.engagement?.current}`
  );
  assert(pure.lastSurvey?.current === 'Sep pulse', 'last survey');
  console.log('pure rollup ok:', {
    issue: issue!.changeSummary,
    party: pure.partisanship!.changeSummary,
    engagement: pure.engagement!.changeSummary,
  });

  // ── Live DB integration ─────────────────────────────────────────────
  const db = await openSql();
  const tag = `vt2_${Date.now()}`;
  const email = `vt2.${tag}@example.com`;
  const phone = '4155550299';

  const [orgs] = await db.execute<RowDataPacket[]>(
    `SELECT id FROM organizations ORDER BY id ASC LIMIT 1`
  );
  assert(orgs[0]?.id != null, 'need org');
  const orgId = Number(orgs[0].id);
  const [users] = await db.execute<RowDataPacket[]>(
    `SELECT id FROM users ORDER BY id ASC LIMIT 1`
  );
  const userId = Number(users[0].id);

  const [pIns] = await db.execute<ResultSetHeader>(
    `INSERT INTO person_records
      (organization_id, cluster_key, first_name, last_name, email, phone, match_confidence)
     VALUES (?, ?, 'VT2', 'Smoke', ?, ?, 0.9)`,
    [orgId, `vt2-${tag}`, email, phone]
  );
  const personId = Number(pIns.insertId);

  await db.execute(
    `INSERT INTO person_source_rows
      (organization_id, source_name, source_row_key, person_record_id, payload)
     VALUES (?, 'donor_list_import', ?, ?, ?)`,
    [orgId, `vt2-donor-${tag}`, personId, JSON.stringify({ raw: { amount: 40 } })]
  );

  const agentToken = `vt2-token-${tag}`;
  const prompt = 'Public security';

  // Survey A (earlier) — neutral
  const [s1] = await db.execute<ResultSetHeader>(
    `INSERT INTO surveys
      (title, description, slug, created_by, is_public, anonymity_level,
       demographics_required, status, organization_id)
     VALUES (?, 'VT2 Jul', ?, ?, 1, 'full', 0, 'published', ?)`,
    [`VT2 Jul ${tag}`, `vt2-jul-${tag}`, userId, orgId]
  );
  const survey1 = Number(s1.insertId);
  const [q1] = await db.execute<ResultSetHeader>(
    `INSERT INTO survey_questions (survey_id, type, prompt, options, is_required, question_order)
     VALUES (?, 'single-choice', ?, NULL, 1, 1)`,
    [survey1, prompt]
  );
  const [r1] = await db.execute<ResultSetHeader>(
    `INSERT INTO survey_responses
      (survey_id, demographics, anonymity_level, ip_address, user_agent, agent_token, source, submitted_at)
     VALUES (?, ?, 'full', '127.0.0.1', 'vt2', ?, 'web', DATE_SUB(NOW(), INTERVAL 60 DAY))`,
    [survey1, JSON.stringify({ email }), agentToken]
  );
  await db.execute(
    `INSERT INTO survey_answers (response_id, question_id, answer_value) VALUES (?, ?, 'neutral')`,
    [r1.insertId, q1.insertId]
  );

  // Survey B (later) — major concern
  const [s2] = await db.execute<ResultSetHeader>(
    `INSERT INTO surveys
      (title, description, slug, created_by, is_public, anonymity_level,
       demographics_required, status, organization_id)
     VALUES (?, 'VT2 Sep', ?, ?, 1, 'full', 0, 'published', ?)`,
    [`VT2 Sep ${tag}`, `vt2-sep-${tag}`, userId, orgId]
  );
  const survey2 = Number(s2.insertId);
  const [q2] = await db.execute<ResultSetHeader>(
    `INSERT INTO survey_questions (survey_id, type, prompt, options, is_required, question_order)
     VALUES (?, 'single-choice', ?, NULL, 1, 1)`,
    [survey2, prompt]
  );
  const [r2] = await db.execute<ResultSetHeader>(
    `INSERT INTO survey_responses
      (survey_id, demographics, anonymity_level, ip_address, user_agent, agent_token, source, submitted_at)
     VALUES (?, ?, 'full', '127.0.0.1', 'vt2', ?, 'web', NOW())`,
    [survey2, JSON.stringify({ email }), agentToken]
  );
  await db.execute(
    `INSERT INTO survey_answers (response_id, question_id, answer_value) VALUES (?, ?, 'major concern')`,
    [r2.insertId, q2.insertId]
  );

  await db.execute(
    `INSERT INTO responder_agents
      (created_from_response_id, agent_token, email, base_profile, completion_percentage, demographic_category)
     VALUES (?, ?, ?, '{}', 100, 'full_profile')`,
    [r2.insertId, agentToken, email]
  );

  // Canvass lean then confirmation
  const [geo] = await db.execute<RowDataPacket[]>(
    `SELECT id FROM voter_geo ORDER BY id ASC LIMIT 1`
  );
  const voterGeoId = geo[0]?.id != null ? Number(geo[0].id) : null;
  if (voterGeoId != null) {
    await db.execute(
      `INSERT INTO canvass_contacts
        (organization_id, voter_geo_id, person_record_id, canvasser_id, status, party, note, recorded_at)
       VALUES (?, ?, ?, ?, 'undecided', 'Independent', 'vt2 early', DATE_SUB(NOW(), INTERVAL 30 DAY))`,
      [orgId, voterGeoId, personId, userId]
    );
    await db.execute(
      `INSERT INTO canvass_contacts
        (organization_id, voter_geo_id, person_record_id, canvasser_id, status, party, note, recorded_at)
       VALUES (?, ?, ?, ?, 'supporter', 'Democrat', 'vt2 late', NOW())`,
      [orgId, voterGeoId, personId, userId]
    );
  }

  await db.execute(`
    CREATE TABLE IF NOT EXISTS survey_optins (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      survey_slug VARCHAR(255) NULL,
      survey_id BIGINT NULL,
      phone VARCHAR(32) NOT NULL,
      consent TINYINT(1) NOT NULL DEFAULT 1,
      disclosure TEXT NULL,
      source VARCHAR(64) NOT NULL DEFAULT 'optin_page',
      ip VARCHAR(64) NULL,
      user_agent VARCHAR(255) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_phone (phone)
    )
  `);
  await db.execute(
    `INSERT INTO survey_optins (survey_slug, phone, consent, source)
     VALUES (?, ?, 1, 'optin_page')`,
    [`vt2-${tag}`, phone]
  );

  const state = await voterState(personId);
  assert(state.personId === personId, 'personId');
  assert(state.issuePositions.length >= 1, 'issues');

  const liveIssue = state.issuePositions.find((a) =>
    a.label.toLowerCase().includes('public security')
  );
  assert(!!liveIssue, 'live issue');
  assert(liveIssue!.current === 'major concern', `live current=${liveIssue!.current}`);
  assert(liveIssue!.history.length >= 2, `live history=${liveIssue!.history.length}`);
  assert(
    !!liveIssue!.changeSummary && liveIssue!.changeSummary.includes('neutral'),
    `live summary=${liveIssue!.changeSummary}`
  );
  assert(state.donationStatus?.current?.startsWith('donor') === true, 'live donation');
  assert(state.lastSurvey?.current != null, 'live last survey');
  assert(state.engagement?.current === 'opted_in', `live eng=${state.engagement?.current}`);
  if (voterGeoId != null) {
    assert(state.partisanship?.current === 'Democrat', `party=${state.partisanship?.current}`);
    assert((state.partisanship?.history.length || 0) >= 2, 'party history');
  }

  // Recompute is stable (idempotent read)
  const again = await voterState(personId);
  assert(again.issuePositions.length === state.issuePositions.length, 'stable recompute');
  assert(again.lastSurvey?.current === state.lastSurvey?.current, 'stable last survey');

  console.log(
    JSON.stringify(
      {
        ok: true,
        personId,
        issue: liveIssue!.changeSummary,
        partisanship: state.partisanship?.changeSummary ?? null,
        donation: state.donationStatus?.changeSummary ?? null,
        engagement: state.engagement?.changeSummary ?? null,
        lastSurvey: state.lastSurvey?.changeSummary ?? null,
        attributeCount: state.attributes.length,
      },
      null,
      2
    )
  );

  // Cleanup
  try {
    await db.execute(`DELETE FROM canvass_contacts WHERE person_record_id = ?`, [personId]);
    await db.execute(`DELETE FROM survey_optins WHERE survey_slug = ?`, [`vt2-${tag}`]);
    await db.execute(`DELETE FROM responder_agents WHERE agent_token = ?`, [agentToken]);
    await db.execute(`DELETE FROM survey_answers WHERE response_id IN (?, ?)`, [
      r1.insertId,
      r2.insertId,
    ]);
    await db.execute(`DELETE FROM survey_responses WHERE id IN (?, ?)`, [
      r1.insertId,
      r2.insertId,
    ]);
    await db.execute(`DELETE FROM survey_questions WHERE id IN (?, ?)`, [
      q1.insertId,
      q2.insertId,
    ]);
    await db.execute(`DELETE FROM surveys WHERE id IN (?, ?)`, [survey1, survey2]);
    await db.execute(`DELETE FROM person_source_rows WHERE person_record_id = ?`, [personId]);
    await db.execute(`DELETE FROM person_records WHERE id = ?`, [personId]);
  } catch (e) {
    console.warn('cleanup warning', e);
  }

  await closePool();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await closePool();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
