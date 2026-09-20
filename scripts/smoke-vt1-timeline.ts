/**
 * VT1 smoke — seed a person cluster with touchpoints across streams,
 * assert voterTimeline returns one chronological projection.
 *
 *   npx tsx --tsconfig tsconfig.json -r dotenv/config scripts/smoke-vt1-timeline.ts
 */

import { openSql, closePool } from '../src/app/utils/database/db';
import { voterTimeline } from '../src/app/utils/services/voter-timeline';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';

require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const db = await openSql();
  const tag = `vt1_${Date.now()}`;
  const email = `vt1.${tag}@example.com`;
  const phone = '4155550199';
  const phoneFmt = '+1 (415) 555-0199';

  const [orgs] = await db.execute<RowDataPacket[]>(
    `SELECT id FROM organizations ORDER BY id ASC LIMIT 1`
  );
  assert(orgs[0]?.id != null, 'need at least one organization');
  const orgId = Number(orgs[0].id);

  const [users] = await db.execute<RowDataPacket[]>(
    `SELECT id FROM users ORDER BY id ASC LIMIT 1`
  );
  assert(users[0]?.id != null, 'need at least one user');
  const userId = Number(users[0].id);

  // ── Person (canonical) ──────────────────────────────────────────────
  const clusterKey = `vt1-${tag}`;
  const [pIns] = await db.execute<ResultSetHeader>(
    `INSERT INTO person_records
      (organization_id, cluster_key, first_name, last_name, email, phone,
       party, match_confidence, city, state, zip)
     VALUES (?, ?, 'VT1', 'Smoke', ?, ?, 'D', 0.9, 'San Francisco', 'CA', '94102')`,
    [orgId, clusterKey, email, phone]
  );
  const personId = Number(pIns.insertId);
  assert(personId > 0, 'person insert');

  // Loser that merges into canonical (audit + pointer)
  const [loserIns] = await db.execute<ResultSetHeader>(
    `INSERT INTO person_records
      (organization_id, cluster_key, first_name, last_name, email, phone,
       match_confidence)
     VALUES (?, ?, 'VT1', 'Loser', ?, NULL, 0.5)`,
    [orgId, `vt1-loser-${tag}`, `loser.${tag}@example.com`]
  );
  const loserId = Number(loserIns.insertId);

  // Source rows (one generic, one fundraising-tagged)
  await db.execute(
    `INSERT INTO person_source_rows
      (organization_id, source_name, source_row_key, person_record_id, payload)
     VALUES (?, 'source_voter', ?, ?, ?),
            (?, 'donor_list_import', ?, ?, ?)`,
    [
      orgId,
      `vt1-voter-${tag}`,
      personId,
      JSON.stringify({ raw: { email, phone } }),
      orgId,
      `vt1-donor-${tag}`,
      personId,
      JSON.stringify({ raw: { email, amount: 50 } }),
    ]
  );

  // Survey + response linked by agent email
  const [sIns] = await db.execute<ResultSetHeader>(
    `INSERT INTO surveys
      (title, description, slug, created_by, is_public, anonymity_level,
       demographics_required, status, organization_id)
     VALUES (?, 'VT1 smoke', ?, ?, 1, 'full', 0, 'published', ?)`,
    [`VT1 Smoke ${tag}`, `vt1-smoke-${tag}`, userId, orgId]
  );
  const surveyId = Number(sIns.insertId);
  const [qIns] = await db.execute<ResultSetHeader>(
    `INSERT INTO survey_questions (survey_id, type, prompt, options, is_required, question_order)
     VALUES (?, 'yes-no', 'Do you support housing reform?', NULL, 1, 1)`,
    [surveyId]
  );
  const questionId = Number(qIns.insertId);

  const agentToken = `vt1-token-${tag}`;
  const [rIns] = await db.execute<ResultSetHeader>(
    `INSERT INTO survey_responses
      (survey_id, demographics, anonymity_level, ip_address, user_agent, agent_token, source)
     VALUES (?, ?, 'full', '127.0.0.1', 'vt1-smoke', ?, 'web')`,
    [surveyId, JSON.stringify({ email, name: 'VT1 Smoke' }), agentToken]
  );
  const responseId = Number(rIns.insertId);
  await db.execute(
    `INSERT INTO survey_answers (response_id, question_id, answer_value) VALUES (?, ?, 'yes')`,
    [responseId, questionId]
  );
  await db.execute(
    `INSERT INTO responder_agents
      (created_from_response_id, agent_token, email, base_profile, completion_percentage, demographic_category)
     VALUES (?, ?, ?, '{}', 100, 'full_profile')`,
    [responseId, agentToken, email]
  );

  // Opt-in by phone (lazy table may already exist)
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
      INDEX idx_phone (phone),
      INDEX idx_slug (survey_slug)
    )
  `);
  await db.execute(
    `INSERT INTO survey_optins (survey_slug, survey_id, phone, consent, disclosure, source)
     VALUES (?, ?, ?, 1, 'VT1 smoke disclosure', 'optin_page')`,
    [`vt1-smoke-${tag}`, surveyId, phoneFmt]
  );

  // Contact list entry
  const [listIns] = await db.execute<ResultSetHeader>(
    `INSERT INTO contact_lists (user_id, name, description, contact_count)
     VALUES (?, ?, 'VT1 smoke list', 1)`,
    [userId, `VT1 List ${tag}`]
  );
  const listId = Number(listIns.insertId);
  await db.execute(
    `INSERT INTO contact_list_entries (list_id, phone, email, first_name, last_name)
     VALUES (?, ?, ?, 'VT1', 'Smoke')`,
    [listId, phone, email]
  );

  // Suppression
  await db.execute(
    `INSERT INTO contact_suppression
      (organization_id, person_record_id, reason, source, notes, created_by)
     VALUES (?, ?, 'do_not_contact', 'manual', 'vt1 smoke', ?)`,
    [orgId, personId, userId]
  );

  // Canvass contact + door confirmation on person
  const [geo] = await db.execute<RowDataPacket[]>(
    `SELECT id FROM voter_geo ORDER BY id ASC LIMIT 1`
  );
  let voterGeoId: number | null = geo[0]?.id != null ? Number(geo[0].id) : null;
  if (voterGeoId == null) {
    // Minimal geo row if empty — try insert with required columns
    try {
      const [gIns] = await db.execute<ResultSetHeader>(
        `INSERT INTO voter_geo (organization_id, street, city, state, zip, latitude, longitude)
         VALUES (?, '1 VT1 St', 'San Francisco', 'CA', '94102', 37.77, -122.42)`,
        [orgId]
      );
      voterGeoId = Number(gIns.insertId);
    } catch {
      // Fall back: skip canvass if schema differs
      voterGeoId = null;
    }
  }

  if (voterGeoId != null) {
    await db.execute(
      `INSERT INTO canvass_contacts
        (organization_id, voter_geo_id, person_record_id, canvasser_id, status, note, party, survey_response_id)
       VALUES (?, ?, ?, ?, 'supporter', 'vt1 door knock', 'Democrat', ?)`,
      [orgId, voterGeoId, personId, userId, responseId]
    );
  }

  await db.execute(
    `UPDATE person_records SET
       canvass_status = 'supporter',
       canvass_party = 'Democrat',
       canvass_notes = 'vt1 confirm',
       canvass_confirmed_at = CURRENT_TIMESTAMP,
       canvass_by_user_id = ?
     WHERE id = ?`,
    [userId, personId]
  );

  // Soft-merge loser → canonical + audit
  await db.execute(
    `UPDATE person_records SET
       merged_into_person_id = ?,
       merged_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [personId, loserId]
  );
  await db.execute(
    `INSERT INTO person_merge_audit
      (organization_id, survivor_person_id, loser_person_id, match_score,
       merged_from, survivor_before, loser_before, fk_moves, status, notes)
     VALUES (?, ?, ?, 0.92, ?, '{}', '{}', '[]', 'applied', 'vt1 smoke merge')`,
    [
      orgId,
      personId,
      loserId,
      JSON.stringify({ survivor: personId, loser: loserId, tag }),
    ]
  );

  // ── Assert projection ─────────────────────────────────────────────
  const timeline = await voterTimeline(personId);
  assert(timeline.length >= 5, `expected rich timeline, got ${timeline.length}`);

  // Chronological
  for (let i = 1; i < timeline.length; i++) {
    const prev = new Date(timeline[i - 1].ts).getTime();
    const cur = new Date(timeline[i].ts).getTime();
    assert(prev <= cur, `out of order at ${i}: ${timeline[i - 1].ts} > ${timeline[i].ts}`);
  }

  const types = new Set(timeline.map((e) => e.type));
  assert(types.has('person.created'), 'missing person.created');
  assert(types.has('source.ingest') || types.has('fundraising.capture'), 'missing source ingest');
  assert(types.has('fundraising.capture'), 'missing fundraising.capture from donor_list_import');
  assert(types.has('survey.response'), 'missing survey.response');
  assert(types.has('optin.signup'), 'missing optin.signup');
  assert(types.has('contact.list_entry'), 'missing contact.list_entry');
  assert(types.has('contact.suppression'), 'missing contact.suppression');
  assert(types.has('person.merge'), 'missing person.merge');
  assert(types.has('canvass.confirmation'), 'missing canvass.confirmation');
  if (voterGeoId != null) {
    assert(types.has('canvass.contact'), 'missing canvass.contact');
  }

  const surveyEv = timeline.find((e) => e.type === 'survey.response');
  assert(!!surveyEv, 'survey event');
  const answers = (surveyEv!.payload.answers as unknown[]) || [];
  assert(answers.length === 1, 'expected 1 survey answer in payload');

  // Loser id resolves into same cluster (merge event present)
  const viaLoser = await voterTimeline(loserId);
  assert(viaLoser.some((e) => e.type === 'person.merge'), 'loser timeline should include merge');
  assert(
    viaLoser.some((e) => e.type === 'survey.response'),
    'loser timeline should inherit survivor survey via cluster'
  );

  // Shape
  for (const e of timeline) {
    assert(typeof e.ts === 'string' && e.ts.includes('T'), `bad ts ${e.ts}`);
    assert(typeof e.source === 'string' && e.source.length > 0, 'bad source');
    assert(typeof e.type === 'string' && e.type.length > 0, 'bad type');
    assert(typeof e.summary === 'string' && e.summary.length > 0, 'bad summary');
    assert(e.payload && typeof e.payload === 'object', 'bad payload');
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        personId,
        loserId,
        eventCount: timeline.length,
        types: [...types].sort(),
        sources: [...new Set(timeline.map((e) => e.source))].sort(),
      },
      null,
      2
    )
  );

  // Cleanup (best-effort)
  try {
    await db.execute(`DELETE FROM person_merge_audit WHERE notes = 'vt1 smoke merge'`);
    await db.execute(`DELETE FROM contact_suppression WHERE notes = 'vt1 smoke'`);
    await db.execute(`DELETE FROM contact_list_entries WHERE list_id = ?`, [listId]);
    await db.execute(`DELETE FROM contact_lists WHERE id = ?`, [listId]);
    await db.execute(`DELETE FROM survey_optins WHERE survey_slug = ?`, [`vt1-smoke-${tag}`]);
    await db.execute(`DELETE FROM canvass_contacts WHERE person_record_id = ?`, [personId]);
    await db.execute(`DELETE FROM responder_agents WHERE agent_token = ?`, [agentToken]);
    await db.execute(`DELETE FROM survey_answers WHERE response_id = ?`, [responseId]);
    await db.execute(`DELETE FROM survey_responses WHERE id = ?`, [responseId]);
    await db.execute(`DELETE FROM survey_questions WHERE id = ?`, [questionId]);
    await db.execute(`DELETE FROM surveys WHERE id = ?`, [surveyId]);
    await db.execute(`DELETE FROM person_source_rows WHERE person_record_id IN (?, ?)`, [
      personId,
      loserId,
    ]);
    await db.execute(`UPDATE person_records SET merged_into_person_id = NULL WHERE id = ?`, [
      loserId,
    ]);
    await db.execute(`DELETE FROM person_records WHERE id IN (?, ?)`, [personId, loserId]);
  } catch (cleanupErr) {
    console.warn('cleanup warning:', cleanupErr);
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
