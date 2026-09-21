/**
 * MT2 smoke — draft_outbound produces honest drafts grounded in stated positions.
 *
 *   npx tsx --tsconfig tsconfig.json -r dotenv/config scripts/smoke-mt2-draft-outbound.ts
 */

import { openSql, closePool } from '../src/app/utils/database/db';
import { draftOutboundTool } from '../src/app/utils/services/tools/draft-outbound';
import {
  aggregateStatedPositions,
  fallbackDrafts,
  buildTailoringContext,
} from '../src/app/utils/services/outbound-draft-service';
import { resolveVoterSegment } from '../src/app/utils/services/voter-segments';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';

require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const db = await openSql();
  const tag = `mt2_${Date.now()}`;
  const email = `mt2.${tag}@example.com`;
  const agentToken = `mt2-token-${tag}`;

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
      (organization_id, cluster_key, first_name, last_name, email,
       gender, age_years, age_bucket, owner_occupied, match_confidence,
       latitude, longitude)
     VALUES (?, ?, 'MT2', 'Woman', ?, 'F', 40, '35-44', 1, 0.95, 37.78, -122.42)`,
    [orgId, `mt2-${tag}`, email]
  );
  const personId = Number(pIns.insertId);

  const [sIns] = await db.execute<ResultSetHeader>(
    `INSERT INTO surveys
      (title, description, slug, created_by, is_public, anonymity_level,
       demographics_required, status, organization_id)
     VALUES (?, 'MT2', ?, ?, 1, 'full', 0, 'published', ?)`,
    [`MT2 Survey ${tag}`, `mt2-${tag}`, userId, orgId]
  );
  const [qIns] = await db.execute<ResultSetHeader>(
    `INSERT INTO survey_questions (survey_id, type, prompt, options, is_required, question_order)
     VALUES (?, 'single-choice', 'Public security', NULL, 1, 1)`,
    [sIns.insertId]
  );
  const [rIns] = await db.execute<ResultSetHeader>(
    `INSERT INTO survey_responses
      (survey_id, demographics, anonymity_level, ip_address, user_agent, agent_token, source)
     VALUES (?, ?, 'full', '127.0.0.1', 'mt2', ?, 'web')`,
    [sIns.insertId, JSON.stringify({ email }), agentToken]
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

  // Pure: fallback drafts mention stated position; empty positions don't invent
  const resolved = await resolveVoterSegment({
    organizationId: orgId,
    segmentId: 'women-35-homeowners-public-security',
    limit: 100,
  });
  assert(resolved.people.some((p) => p.personId === personId), 'person in segment');
  // Ensure state is loaded for aggregation
  for (const p of resolved.people) {
    assert(p.state != null, 'state attached');
  }
  const ctx = buildTailoringContext(resolved);
  const stated = aggregateStatedPositions(resolved);
  assert(stated.some((s) => /public security/i.test(s.label)), 'stated public security');
  assert(stated.some((s) => /major concern/i.test(s.value)), 'stated major concern');

  const withPos = fallbackDrafts(ctx, ['sms', 'letter']);
  assert(withPos.every((d) => d.honest), 'honest flag');
  assert(
    withPos.some((d) => /major concern/i.test(d.body)),
    'fallback cites stated position'
  );

  const emptyCtx = {
    ...ctx,
    statedPositions: [],
  };
  const noPos = fallbackDrafts(emptyCtx, ['email']);
  assert(
    /do not have a survey-stated|does not invent/i.test(noPos[0].body),
    'no invent when empty'
  );
  assert(!/public security/i.test(noPos[0].body), 'no fabricated issue');

  // Tool with mock (deterministic)
  const mockResult = await draftOutboundTool.execute(
    {
      segmentId: 'women-35-homeowners-public-security',
      formats: ['letter', 'sms'],
      mock: true,
    },
    { userId, organizationId: orgId }
  );
  assert(mockResult.data?.implemented === true, 'implemented');
  const drafts = mockResult.data?.drafts as Array<{ body: string; groundedIn: unknown[] }>;
  assert(drafts.length === 2, `draft count ${drafts.length}`);
  assert(drafts.some((d) => /major concern/i.test(d.body)), 'mock cites position');

  // Live LLM path (optional — should still succeed with anthropic or fallback)
  const live = await draftOutboundTool.execute(
    {
      segmentId: 'women-35-homeowners-public-security',
      formats: ['email'],
      goal: 'Invite to public safety briefing',
    },
    { userId, organizationId: orgId }
  );
  const liveDrafts = live.data?.drafts as Array<{ body: string }>;
  assert(liveDrafts?.length === 1, 'live email draft');
  assert(liveDrafts[0].body.length > 20, 'live body non-empty');

  console.log(
    JSON.stringify(
      {
        ok: true,
        personId,
        stated: stated.map((s) => ({ label: s.label, value: s.value, count: s.count })),
        mockFormats: drafts.map((d) => Object.keys(d)),
        liveFallback: live.data?.usedFallback,
        livePreview: liveDrafts[0].body.slice(0, 180),
      },
      null,
      2
    )
  );

  try {
    await db.execute(`DELETE FROM responder_agents WHERE agent_token = ?`, [agentToken]);
    await db.execute(`DELETE FROM survey_answers WHERE response_id = ?`, [rIns.insertId]);
    await db.execute(`DELETE FROM survey_responses WHERE id = ?`, [rIns.insertId]);
    await db.execute(`DELETE FROM survey_questions WHERE id = ?`, [qIns.insertId]);
    await db.execute(`DELETE FROM surveys WHERE id = ?`, [sIns.insertId]);
    await db.execute(`DELETE FROM person_records WHERE id = ?`, [personId]);
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
