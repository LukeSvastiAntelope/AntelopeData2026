/**
 * MT4 smoke — consultant-ready draft_outbound + stage_outbound_send gate +
 * audience hint + prompt-assist + registry integrity.
 *
 *   npx tsx --tsconfig tsconfig.json -r dotenv/config scripts/smoke-mt4-microtargeting.ts
 */

import { closePool, openSql } from '../src/app/utils/database/db';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import {
  assertRegistryRiskIntegrity,
  executeTool,
  TOOL_REGISTRY,
} from '../src/app/utils/services/tools';
import { draftOutboundTool } from '../src/app/utils/services/tools/draft-outbound';
import { assistOutboundGoal } from '../src/app/utils/services/outbound-prompt-assist';
import {
  resolveSegmentHint,
  listTrackedSegmentPresets,
} from '../src/app/utils/voter-segment-presets';

require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  assertRegistryRiskIntegrity();
  assert(
    TOOL_REGISTRY.draft_outbound.risk === 'auto',
    'draft_outbound must be auto'
  );
  assert(
    TOOL_REGISTRY.stage_outbound_send.risk === 'approval',
    'stage_outbound_send must be approval'
  );

  const women =
    resolveSegmentHint('women 35+ homeowners public security letter') ||
    resolveSegmentHint('women 35 public security');
  assert(
    women === 'women-35-homeowners-public-security' ||
      women === 'women-35-public-security-major',
    `audience hint resolved unexpectedly: ${women}`
  );
  assert(listTrackedSegmentPresets().length >= 3, 'tracked presets present');

  const assisted = await assistOutboundGoal({
    plainDescription: 'ask them to come to thursday town hall about safety',
    segmentName: 'Women 35+ homeowners',
    formats: ['letter'],
    mock: true,
  });
  assert(assisted.goal.length > 10, 'assisted goal');
  assert(assisted.usedFallback === true, 'mock assist fallback');

  const db = await openSql();
  const tag = `mt4_${Date.now()}`;
  const email = `mt4.${tag}@example.com`;
  const phone = '+15559876543';
  const agentToken = `mt4-token-${tag}`;
  const uniqueZip = `8${String(Date.now()).slice(-4)}`;

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
       gender, age_years, age_bucket, owner_occupied, match_confidence,
       latitude, longitude, zip)
     VALUES (?, ?, 'MT4', 'Woman', ?, ?, 'F', 42, '35-44', 1, 0.95, 37.78, -122.42, ?)`,
    [orgId, `mt4-${tag}`, email, phone, uniqueZip]
  );
  const personId = Number(pIns.insertId);

  const [sIns] = await db.execute<ResultSetHeader>(
    `INSERT INTO surveys
      (title, description, slug, created_by, is_public, anonymity_level,
       demographics_required, status, organization_id)
     VALUES (?, 'MT4', ?, ?, 1, 'full', 0, 'published', ?)`,
    [`MT4 Survey ${tag}`, `mt4-${tag}`, userId, orgId]
  );
  const [qIns] = await db.execute<ResultSetHeader>(
    `INSERT INTO survey_questions (survey_id, type, prompt, options, is_required, question_order)
     VALUES (?, 'single-choice', 'Public security', NULL, 1, 1)`,
    [sIns.insertId]
  );
  const [rIns] = await db.execute<ResultSetHeader>(
    `INSERT INTO survey_responses
      (survey_id, demographics, anonymity_level, ip_address, user_agent, agent_token, source)
     VALUES (?, ?, 'full', '127.0.0.1', 'mt4', ?, 'web')`,
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

  // Consultant-style: audience hint → letter draft (auto)
  const drafted = await draftOutboundTool.execute(
    {
      audience: 'women 35 homeowners public security',
      formats: ['letter', 'sms'],
      goal: 'Invite to town hall on public safety',
      mock: true,
    },
    { userId, organizationId: orgId }
  );
  assert(drafted.data?.implemented === true, 'draft implemented');
  const drafts = drafted.data?.drafts as Array<{
    format: string;
    body: string;
    smallSampleDisclaimerApplied?: boolean;
  }>;
  assert(drafts?.some((d) => d.format === 'letter'), 'letter draft');
  assert(drafts?.some((d) => d.format === 'sms'), 'sms draft');
  assert(
    String(drafted.data?.nextStep || '').includes('stage_outbound_send'),
    'next step points at gated send'
  );

  const smsBody = drafts.find((d) => d.format === 'sms')!.body;

  // stage_outbound_send without approval → pending_approval (executor gate)
  const staged = await executeTool(
    {
      name: 'stage_outbound_send',
      input: {
        segmentId: 'women-35-homeowners-public-security',
        format: 'sms',
        body: smsBody,
        recipientOverride: { phones: [phone], emails: [email], personIds: [personId] },
        approved: true, // must be stripped / ignored
      },
    },
    { userId, organizationId: orgId }
  );
  assert(staged.status === 'pending_approval', `expected pending got ${staged.status}`);
  assert(staged.ok === true, 'pending is ok');
  assert(staged.tool === 'stage_outbound_send', 'tool name');
  assert(
    !('approved' in ((staged as { staged?: { input?: object } }).staged?.input || {})),
    'approved must not leak into staged input'
  );

  // Also via audience-resolved thin ad-hoc definition path
  const thin = await draftOutboundTool.execute(
    {
      definition: {
        gender: ['F'],
        minAgeYears: 35,
        ownerOccupied: true,
        zip: [uniqueZip],
        tracked: [{ issue: 'public security', equals: 'major concern' }],
      },
      formats: ['email'],
      mock: true,
    },
    { userId, organizationId: orgId }
  );
  const thinCtx = thin.data?.context as { thinSegment?: boolean; voterCount?: number };
  assert(thinCtx?.voterCount === 1, 'thin n=1');
  assert(thinCtx?.thinSegment === true, 'thin flag');
  const thinDrafts = thin.data?.drafts as Array<{ smallSampleDisclaimerApplied?: boolean }>;
  assert(
    thinDrafts?.every((d) => d.smallSampleDisclaimerApplied),
    'thin disclaimer on drafts'
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        audienceResolved: women,
        draftFormats: drafts.map((d) => d.format),
        stagedStatus: staged.status,
        thinVoters: thinCtx?.voterCount,
      },
      null,
      2
    )
  );
  console.log(
    'PASS: MT4 — draft_outbound (auto) + stage_outbound_send (approval) + audience hint + prompt-assist'
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
