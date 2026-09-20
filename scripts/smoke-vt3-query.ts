/**
 * VT3 smoke — D2/collation + VT2 tracked attributes as one filterable query.
 * Example: woman, 35+, public-security = major concern, has donated.
 *
 *   npx tsx --tsconfig tsconfig.json -r dotenv/config scripts/smoke-vt3-query.ts
 */

import { openSql, closePool } from '../src/app/utils/database/db';
import { queryVoters, matchesTrackedFilters } from '../src/app/utils/services/voter-query';
import { voterStateFromTimeline } from '../src/app/utils/services/voter-state';
import type { TimelineEvent } from '../src/app/utils/services/voter-timeline';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';

require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  // ── Pure predicate ──────────────────────────────────────────────────
  const synthetic: TimelineEvent[] = [
    {
      ts: '2026-07-01T00:00:00.000Z',
      source: 'survey_responses',
      type: 'survey.response',
      summary: 'jul',
      payload: {
        surveyTitle: 'Jul',
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
      ts: '2026-09-01T00:00:00.000Z',
      source: 'survey_responses',
      type: 'survey.response',
      summary: 'sep',
      payload: {
        surveyTitle: 'Sep',
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
      ts: '2026-08-01T00:00:00.000Z',
      source: 'fundraising',
      type: 'fundraising.capture',
      summary: 'gift',
      payload: { sourceName: 'donor_list', payload: { raw: { amount: 10 } } },
    },
  ];
  const st = voterStateFromTimeline(1, synthetic);
  const hit = matchesTrackedFilters(st, [
    { issue: 'public security', equals: 'major concern', changed: true, was: 'neutral' },
    { hasDonated: true },
  ]);
  assert(hit.ok, 'pure tracked match');
  assert(hit.matched.some((a) => a.label === 'Public security'), 'issue matched');
  const miss = matchesTrackedFilters(st, [
    { issue: 'public security', equals: 'not an issue' },
  ]);
  assert(!miss.ok, 'pure miss');

  // ── Live DB ─────────────────────────────────────────────────────────
  const db = await openSql();
  const tag = `vt3_${Date.now()}`;
  const email = `vt3.${tag}@example.com`;

  const [orgs] = await db.execute<RowDataPacket[]>(
    `SELECT id FROM organizations ORDER BY id ASC LIMIT 1`
  );
  assert(orgs[0]?.id != null, 'need org');
  const orgId = Number(orgs[0].id);
  const [users] = await db.execute<RowDataPacket[]>(
    `SELECT id FROM users ORDER BY id ASC LIMIT 1`
  );
  const userId = Number(users[0].id);

  // Scrub prior VT3 smoke leftovers (failed runs leave rows)
  {
    const [stale] = await db.execute<RowDataPacket[]>(
      `SELECT id FROM person_records
       WHERE organization_id = ? AND (
         cluster_key LIKE 'vt3-%' OR email LIKE 'vt3.%@example.com'
         OR email LIKE 'man.vt3_%@example.com' OR email LIKE 'young.vt3_%@example.com'
       )`,
      [orgId]
    );
    for (const row of stale) {
      const id = Number(row.id);
      await db.execute(`DELETE FROM person_source_rows WHERE person_record_id = ?`, [id]);
      await db.execute(`DELETE FROM canvass_contacts WHERE person_record_id = ?`, [id]);
      await db.execute(`DELETE FROM contact_suppression WHERE person_record_id = ?`, [id]);
      await db.execute(`DELETE FROM person_records WHERE id = ?`, [id]);
    }
  }

  // Target: woman, 35+, geocoded
  const [pIns] = await db.execute<ResultSetHeader>(
    `INSERT INTO person_records
      (organization_id, cluster_key, first_name, last_name, email, phone,
       gender, age_years, age_bucket, party, match_confidence,
       latitude, longitude, city, state, zip)
     VALUES (?, ?, 'VT3', 'Woman', ?, '4155550399',
             'F', 38, '35-44', 'D', 0.95,
             37.78, -122.42, 'San Francisco', 'CA', '94102')`,
    [orgId, `vt3-${tag}`, email]
  );
  const personId = Number(pIns.insertId);

  // Distractor: man, 38, same coords — must NOT match gender filter
  const [dIns] = await db.execute<ResultSetHeader>(
    `INSERT INTO person_records
      (organization_id, cluster_key, first_name, last_name, email,
       gender, age_years, age_bucket, match_confidence, latitude, longitude)
     VALUES (?, ?, 'VT3', 'Man', ?, 'M', 38, '35-44', 0.9, 37.781, -122.421)`,
    [orgId, `vt3-man-${tag}`, `man.${tag}@example.com`]
  );
  const distractorId = Number(dIns.insertId);

  // Distractor: woman under 35
  const [yIns] = await db.execute<ResultSetHeader>(
    `INSERT INTO person_records
      (organization_id, cluster_key, first_name, last_name, email,
       gender, age_years, age_bucket, match_confidence, latitude, longitude)
     VALUES (?, ?, 'VT3', 'Young', ?, 'F', 28, '25-34', 0.9, 37.782, -122.422)`,
    [orgId, `vt3-young-${tag}`, `young.${tag}@example.com`]
  );
  const youngId = Number(yIns.insertId);

  await db.execute(
    `INSERT INTO person_source_rows
      (organization_id, source_name, source_row_key, person_record_id, payload)
     VALUES (?, 'donor_list_import', ?, ?, ?)`,
    [orgId, `vt3-donor-${tag}`, personId, JSON.stringify({ raw: { amount: 75 } })]
  );

  const agentToken = `vt3-token-${tag}`;
  const prompt = 'Public security';

  const [s1] = await db.execute<ResultSetHeader>(
    `INSERT INTO surveys
      (title, description, slug, created_by, is_public, anonymity_level,
       demographics_required, status, organization_id)
     VALUES (?, 'VT3 Jul', ?, ?, 1, 'full', 0, 'published', ?)`,
    [`VT3 Jul ${tag}`, `vt3-jul-${tag}`, userId, orgId]
  );
  const [q1] = await db.execute<ResultSetHeader>(
    `INSERT INTO survey_questions (survey_id, type, prompt, options, is_required, question_order)
     VALUES (?, 'single-choice', ?, NULL, 1, 1)`,
    [s1.insertId, prompt]
  );
  const [r1] = await db.execute<ResultSetHeader>(
    `INSERT INTO survey_responses
      (survey_id, demographics, anonymity_level, ip_address, user_agent, agent_token, source, submitted_at)
     VALUES (?, ?, 'full', '127.0.0.1', 'vt3', ?, 'web', DATE_SUB(NOW(), INTERVAL 60 DAY))`,
    [s1.insertId, JSON.stringify({ email }), agentToken]
  );
  await db.execute(
    `INSERT INTO survey_answers (response_id, question_id, answer_value) VALUES (?, ?, 'neutral')`,
    [r1.insertId, q1.insertId]
  );

  const [s2] = await db.execute<ResultSetHeader>(
    `INSERT INTO surveys
      (title, description, slug, created_by, is_public, anonymity_level,
       demographics_required, status, organization_id)
     VALUES (?, 'VT3 Sep', ?, ?, 1, 'full', 0, 'published', ?)`,
    [`VT3 Sep ${tag}`, `vt3-sep-${tag}`, userId, orgId]
  );
  const [q2] = await db.execute<ResultSetHeader>(
    `INSERT INTO survey_questions (survey_id, type, prompt, options, is_required, question_order)
     VALUES (?, 'single-choice', ?, NULL, 1, 1)`,
    [s2.insertId, prompt]
  );
  const [r2] = await db.execute<ResultSetHeader>(
    `INSERT INTO survey_responses
      (survey_id, demographics, anonymity_level, ip_address, user_agent, agent_token, source, submitted_at)
     VALUES (?, ?, 'full', '127.0.0.1', 'vt3', ?, 'web', NOW())`,
    [s2.insertId, JSON.stringify({ email }), agentToken]
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

  // The brief's example query
  const result = await queryVoters({
    organizationId: orgId,
    gender: ['woman'],
    minAgeYears: 35,
    hasDonated: true,
    tracked: [
      {
        issue: 'public security',
        equals: 'major concern',
        changed: true,
        was: 'neutral',
      },
    ],
    requireCoordinates: true,
    candidateLimit: 500,
    includeState: true,
  });

  assert(result.count === 1, `expected 1 hit, got ${result.count}`);
  assert(result.people[0].personId === personId, 'wrong person');
  assert(
    result.people[0].matchedAttributes.some((a) =>
      a.label.toLowerCase().includes('public security')
    ),
    'matched issue attr'
  );
  assert(
    result.people[0].state?.donationStatus?.current?.startsWith('donor') === true,
    'donation on state'
  );

  // Gender-only among our smoke cohort (no zip — young/man lack 94102)
  const women = await queryVoters({
    organizationId: orgId,
    gender: ['F'],
    requireCoordinates: true,
    candidateLimit: 5000,
  });
  const womanIds = new Set(women.people.map((p) => p.personId));
  assert(womanIds.has(personId), 'woman target in gender filter');
  assert(womanIds.has(youngId), 'young woman in gender filter');
  assert(!womanIds.has(distractorId), 'man excluded');

  // Change-state only
  const changed = await queryVoters({
    organizationId: orgId,
    gender: ['woman'],
    minAgeYears: 35,
    tracked: [{ issue: 'public-security', changed: true, was: 'neutral' }],
    requireCoordinates: true,
    candidateLimit: 200,
  });
  assert(changed.count === 1, `change-state count=${changed.count}`);

  console.log(
    JSON.stringify(
      {
        ok: true,
        personId,
        count: result.count,
        candidateCount: result.candidateCount,
        matched: result.people[0].matchedAttributes.map((a) => ({
          key: a.key,
          current: a.current,
          changeSummary: a.changeSummary,
        })),
        donation: result.people[0].state?.donationStatus?.changeSummary,
      },
      null,
      2
    )
  );

  // Cleanup
  try {
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
    await db.execute(`DELETE FROM surveys WHERE id IN (?, ?)`, [s1.insertId, s2.insertId]);
    await db.execute(`DELETE FROM person_source_rows WHERE person_record_id = ?`, [personId]);
    await db.execute(`DELETE FROM person_records WHERE id IN (?, ?, ?)`, [
      personId,
      distractorId,
      youngId,
    ]);
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
