/**
 * MT1 smoke — named segment resolves to live voters from tracked + map attrs.
 *
 *   npx tsx --tsconfig tsconfig.json -r dotenv/config scripts/smoke-mt1-segments.ts
 */

import { openSql, closePool } from '../src/app/utils/database/db';
import { segmentListTool } from '../src/app/utils/services/tools/segment-list';
import {
  resolveVoterSegment,
  saveVoterSegment,
  deleteVoterSegment,
} from '../src/app/utils/services/voter-segments';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';

require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const db = await openSql();
  const tag = `mt1_${Date.now()}`;
  const email = `mt1.${tag}@example.com`;
  const agentToken = `mt1-token-${tag}`;

  const [orgs] = await db.execute<RowDataPacket[]>(
    `SELECT id FROM organizations ORDER BY id ASC LIMIT 1`
  );
  assert(orgs[0]?.id != null, 'need org');
  const orgId = Number(orgs[0].id);
  const [users] = await db.execute<RowDataPacket[]>(
    `SELECT id FROM users ORDER BY id ASC LIMIT 1`
  );
  const userId = Number(users[0].id);

  // Target: woman 35+ homeowner with public-security major concern
  const [pIns] = await db.execute<ResultSetHeader>(
    `INSERT INTO person_records
      (organization_id, cluster_key, first_name, last_name, email, phone,
       gender, age_years, age_bucket, party, owner_occupied, match_confidence,
       latitude, longitude, city, state, zip)
     VALUES (?, ?, 'MT1', 'Woman', ?, '4155550599',
             'F', 42, '35-44', 'D', 1, 0.95,
             37.78, -122.42, 'San Francisco', 'CA', '94102')`,
    [orgId, `mt1-${tag}`, email]
  );
  const personId = Number(pIns.insertId);

  // Distractor: man 42 homeowner — must not match women filter
  const [dIns] = await db.execute<ResultSetHeader>(
    `INSERT INTO person_records
      (organization_id, cluster_key, first_name, last_name, email,
       gender, age_years, age_bucket, owner_occupied, match_confidence,
       latitude, longitude)
     VALUES (?, ?, 'MT1', 'Man', ?, 'M', 42, '35-44', 1, 0.9, 37.781, -122.421)`,
    [orgId, `mt1-man-${tag}`, `man.${tag}@example.com`]
  );
  const manId = Number(dIns.insertId);

  const [sIns] = await db.execute<ResultSetHeader>(
    `INSERT INTO surveys
      (title, description, slug, created_by, is_public, anonymity_level,
       demographics_required, status, organization_id)
     VALUES (?, 'MT1', ?, ?, 1, 'full', 0, 'published', ?)`,
    [`MT1 Survey ${tag}`, `mt1-${tag}`, userId, orgId]
  );
  const [qIns] = await db.execute<ResultSetHeader>(
    `INSERT INTO survey_questions (survey_id, type, prompt, options, is_required, question_order)
     VALUES (?, 'single-choice', 'Public security', NULL, 1, 1)`,
    [sIns.insertId]
  );
  const [rIns] = await db.execute<ResultSetHeader>(
    `INSERT INTO survey_responses
      (survey_id, demographics, anonymity_level, ip_address, user_agent, agent_token, source)
     VALUES (?, ?, 'full', '127.0.0.1', 'mt1', ?, 'web')`,
    [sIns.insertId, JSON.stringify({ email, name: 'MT1 Woman' }), agentToken]
  );
  await db.execute(
    `INSERT INTO survey_answers (response_id, question_id, answer_value) VALUES (?, ?, 'major concern')`,
    [rIns.insertId, qIns.insertId]
  );
  await db.execute(
    `INSERT INTO responder_agents
      (created_from_response_id, agent_token, email, base_profile, completion_percentage, demographic_category)
     VALUES (?, ?, ?, '{}', 100, 'full_profile')`,
    [rIns.insertId, agentToken, email]
  );

  // Preset resolve
  const resolved = await resolveVoterSegment({
    organizationId: orgId,
    segmentId: 'women-35-homeowners-public-security',
    limit: 500,
  });
  assert(resolved.count >= 1, `preset count ${resolved.count}`);
  assert(
    resolved.people.some((p) => p.personId === personId),
    'target in preset'
  );
  assert(
    !resolved.people.some((p) => p.personId === manId),
    'man excluded from women segment'
  );
  assert(resolved.disclaimer.includes('Not a targeting'), 'disclaimer');

  // Save named segment + re-resolve
  const saved = await saveVoterSegment({
    organizationId: orgId,
    name: `MT1 Homeowners ${tag}`,
    slug: `mt1-homeowners-${tag}`,
    description: 'smoke saved segment',
    createdBy: userId,
    definition: {
      gender: ['woman'],
      minAgeYears: 35,
      ownerOccupied: true,
      tracked: [{ issue: 'public security', equals: 'major concern' }],
    },
  });
  assert(saved.id > 0, 'saved id');

  const resolvedSaved = await resolveVoterSegment({
    organizationId: orgId,
    segmentId: saved.slug,
  });
  assert(resolvedSaved.source === 'saved', 'saved source');
  assert(
    resolvedSaved.people.some((p) => p.personId === personId),
    'saved resolves target'
  );

  // Recompute: not frozen — second resolve same count
  const again = await resolveVoterSegment({
    organizationId: orgId,
    segmentId: saved.slug,
  });
  assert(again.count === resolvedSaved.count, 'live recompute stable');

  // segment_list tool tracked path
  const toolResult = await segmentListTool.execute(
    { segmentId: 'women-35-homeowners-public-security', limit: 200 },
    { userId, organizationId: orgId }
  );
  assert(toolResult.data?.mode === 'tracked', 'tool mode tracked');
  assert(Number(toolResult.data?.count) >= 1, 'tool count');
  const toolPeople = toolResult.data?.people as Array<{ personId: number }>;
  assert(toolPeople.some((p) => p.personId === personId), 'tool includes target');

  console.log(
    JSON.stringify(
      {
        ok: true,
        personId,
        presetCount: resolved.count,
        savedSlug: saved.slug,
        savedCount: resolvedSaved.count,
        toolCount: toolResult.data?.count,
        matched: resolved.people
          .find((p) => p.personId === personId)
          ?.matchedAttributes.map((a) => ({
            key: a.key,
            current: a.current,
          })),
      },
      null,
      2
    )
  );

  // Cleanup
  try {
    await deleteVoterSegment(orgId, saved.slug);
    await db.execute(`DELETE FROM responder_agents WHERE agent_token = ?`, [agentToken]);
    await db.execute(`DELETE FROM survey_answers WHERE response_id = ?`, [rIns.insertId]);
    await db.execute(`DELETE FROM survey_responses WHERE id = ?`, [rIns.insertId]);
    await db.execute(`DELETE FROM survey_questions WHERE id = ?`, [qIns.insertId]);
    await db.execute(`DELETE FROM surveys WHERE id = ?`, [sIns.insertId]);
    await db.execute(`DELETE FROM person_records WHERE id IN (?, ?)`, [personId, manId]);
  } catch (e) {
    console.warn('cleanup', e);
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
