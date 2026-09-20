/**
 * VT4 smoke — loadTwinTracking resolves agent_token → person cluster,
 * returns timeline + state for the Voter 360 UI.
 *
 *   npx tsx --tsconfig tsconfig.json -r dotenv/config scripts/smoke-vt4-tracking-ui.ts
 */

import { openSql, closePool } from '../src/app/utils/database/db';
import { loadTwinTracking } from '../src/app/utils/services/voter-tracking';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';

require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const db = await openSql();
  const tag = `vt4_${Date.now()}`;
  const email = `vt4.${tag}@example.com`;
  const agentToken = `vt4-token-${tag}`;

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
      (organization_id, cluster_key, first_name, last_name, email, phone,
       gender, age_years, age_bucket, party, match_confidence,
       latitude, longitude, canvass_status, canvass_party, canvass_confirmed_at)
     VALUES (?, ?, 'VT4', 'Demo', ?, '4155550499',
             'F', 41, '35-44', 'D', 0.95,
             37.78, -122.42, 'supporter', 'Democrat', NOW())`,
    [orgId, `vt4-${tag}`, email]
  );
  const personId = Number(pIns.insertId);

  await db.execute(
    `INSERT INTO person_source_rows
      (organization_id, source_name, source_row_key, person_record_id, payload)
     VALUES (?, 'donor_list_import', ?, ?, ?)`,
    [orgId, `vt4-donor-${tag}`, personId, JSON.stringify({ raw: { amount: 50 } })]
  );

  const [sIns] = await db.execute<ResultSetHeader>(
    `INSERT INTO surveys
      (title, description, slug, created_by, is_public, anonymity_level,
       demographics_required, status, organization_id)
     VALUES (?, 'VT4', ?, ?, 1, 'full', 0, 'published', ?)`,
    [`VT4 Survey ${tag}`, `vt4-${tag}`, userId, orgId]
  );
  const [qIns] = await db.execute<ResultSetHeader>(
    `INSERT INTO survey_questions (survey_id, type, prompt, options, is_required, question_order)
     VALUES (?, 'single-choice', 'Public security', NULL, 1, 1)`,
    [sIns.insertId]
  );
  const [rIns] = await db.execute<ResultSetHeader>(
    `INSERT INTO survey_responses
      (survey_id, demographics, anonymity_level, ip_address, user_agent, agent_token, source)
     VALUES (?, ?, 'full', '127.0.0.1', 'vt4', ?, 'web')`,
    [sIns.insertId, JSON.stringify({ email, name: 'VT4 Demo' }), agentToken]
  );
  await db.execute(
    `INSERT INTO survey_answers (response_id, question_id, answer_value) VALUES (?, ?, 'major concern')`,
    [rIns.insertId, qIns.insertId]
  );
  await db.execute(
    `INSERT INTO responder_agents
      (created_from_response_id, agent_token, email, base_profile, completion_percentage, demographic_category)
     VALUES (?, ?, ?, ?, 100, 'full_profile')`,
    [
      rIns.insertId,
      agentToken,
      email,
      JSON.stringify({
        demographics: { name: 'VT4 Demo', email, age: '41', gender: 'F' },
      }),
    ]
  );

  const [geo] = await db.execute<RowDataPacket[]>(
    `SELECT id FROM voter_geo ORDER BY id ASC LIMIT 1`
  );
  if (geo[0]?.id != null) {
    await db.execute(
      `INSERT INTO canvass_contacts
        (organization_id, voter_geo_id, person_record_id, canvasser_id, status, party, note)
       VALUES (?, ?, ?, ?, 'supporter', 'Democrat', 'vt4 door')`,
      [orgId, Number(geo[0].id), personId, userId]
    );
  }

  const bundle = await loadTwinTracking(agentToken);
  assert(!!bundle, 'bundle');
  assert(bundle!.linked === true, 'should link via email');
  assert(bundle!.personId === personId, `personId ${bundle!.personId}`);
  assert(bundle!.timeline.length >= 3, `timeline ${bundle!.timeline.length}`);
  assert(
    bundle!.state.issuePositions.some((a) => a.current === 'major concern'),
    'issue position'
  );
  assert(bundle!.state.donationStatus?.current?.startsWith('donor') === true, 'donation');
  assert(!!bundle!.disclaimer.includes('not a targeting score'), 'disclaimer');

  // Unlinked path: agent with no person email
  const orphanToken = `vt4-orphan-${tag}`;
  await db.execute(
    `INSERT INTO responder_agents
      (created_from_response_id, agent_token, email, base_profile, completion_percentage, demographic_category)
     VALUES (?, ?, ?, '{}', 50, 'minimal_profile')`,
    [rIns.insertId, orphanToken, `orphan.${tag}@example.invalid`]
  );
  // Copy a survey response onto orphan token for survey-only timeline
  const [r2] = await db.execute<ResultSetHeader>(
    `INSERT INTO survey_responses
      (survey_id, demographics, anonymity_level, ip_address, user_agent, agent_token, source)
     VALUES (?, '{}', 'full', '127.0.0.1', 'vt4', ?, 'web')`,
    [sIns.insertId, orphanToken]
  );
  await db.execute(
    `INSERT INTO survey_answers (response_id, question_id, answer_value) VALUES (?, ?, 'neutral')`,
    [r2.insertId, qIns.insertId]
  );

  const orphan = await loadTwinTracking(orphanToken);
  assert(!!orphan, 'orphan bundle');
  assert(orphan!.linked === false, 'orphan unlinked');
  assert(orphan!.timeline.length >= 1, 'orphan survey timeline');
  assert(orphan!.state.issuePositions.length >= 1, 'orphan issues from survey');

  console.log(
    JSON.stringify(
      {
        ok: true,
        agentToken,
        personId,
        timelineCount: bundle!.timeline.length,
        issues: bundle!.state.issuePositions.map((a) => a.changeSummary),
        donation: bundle!.state.donationStatus?.current,
        orphanEvents: orphan!.timeline.length,
      },
      null,
      2
    )
  );

  // Keep linked demo row for UI walkthrough — print URL hint
  console.log(`UI_DEMO_TOKEN=${agentToken}`);
  console.log(`UI_DEMO_PATH=/digital-twins/${agentToken}`);

  // Cleanup orphan only; leave linked demo for optional UI check (delete if UI_DEMO_KEEP!=1)
  try {
    await db.execute(`DELETE FROM survey_answers WHERE response_id = ?`, [r2.insertId]);
    await db.execute(`DELETE FROM survey_responses WHERE id = ?`, [r2.insertId]);
    await db.execute(`DELETE FROM responder_agents WHERE agent_token = ?`, [orphanToken]);
  } catch (e) {
    console.warn('orphan cleanup', e);
  }

  if (process.env.UI_DEMO_KEEP === '1') {
    console.log('Keeping linked demo person/twin for UI');
  } else {
    try {
      await db.execute(`DELETE FROM canvass_contacts WHERE person_record_id = ?`, [personId]);
      await db.execute(`DELETE FROM responder_agents WHERE agent_token = ?`, [agentToken]);
      await db.execute(`DELETE FROM survey_answers WHERE response_id = ?`, [rIns.insertId]);
      await db.execute(`DELETE FROM survey_responses WHERE id = ?`, [rIns.insertId]);
      await db.execute(`DELETE FROM survey_questions WHERE id = ?`, [qIns.insertId]);
      await db.execute(`DELETE FROM surveys WHERE id = ?`, [sIns.insertId]);
      await db.execute(`DELETE FROM person_source_rows WHERE person_record_id = ?`, [personId]);
      await db.execute(`DELETE FROM person_records WHERE id = ?`, [personId]);
    } catch (e) {
      console.warn('cleanup', e);
    }
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
