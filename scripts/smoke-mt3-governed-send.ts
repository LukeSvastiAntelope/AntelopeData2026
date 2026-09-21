/**
 * MT3 smoke — thin-segment disclaimer + governed stage through approval gate.
 *
 *   npx tsx --tsconfig tsconfig.json -r dotenv/config scripts/smoke-mt3-governed-send.ts
 */

import { closePool, openSql } from '../src/app/utils/database/db';
import { ConsultantRepo } from '../src/app/utils/database/consultant-repo';
import { LoopConfigRepo } from '../src/app/utils/database/loop-config-repo';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import {
  SMALL_SAMPLE_DISCLAIMER,
  THIN_SEGMENT_THRESHOLD,
  applyThinSegmentDiscipline,
  buildTailoringContext,
  draftOutboundForSegment,
  fallbackDrafts,
  isThinSegment,
} from '../src/app/utils/services/outbound-draft-service';
import { stageOutboundDraftSend } from '../src/app/utils/services/outbound-send-governance';
import { executeTool } from '../src/app/utils/services/tools/executor';
import { approveStagedAction } from '../src/app/utils/services/consultant-agent';

require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  assert(isThinSegment(8), '8 voters is thin');
  assert(isThinSegment(THIN_SEGMENT_THRESHOLD - 1), 'threshold-1 is thin');
  assert(!isThinSegment(THIN_SEGMENT_THRESHOLD), 'at threshold not thin');
  assert(!isThinSegment(0), 'empty not thin');

  const db = await openSql();
  const tag = `mt3_${Date.now()}`;
  const email = `mt3.${tag}@example.com`;
  const phone = '+15551230987';
  const agentToken = `mt3-token-${tag}`;

  const [orgs] = await db.execute<RowDataPacket[]>(
    `SELECT id FROM organizations ORDER BY id ASC LIMIT 1`
  );
  assert(orgs[0]?.id != null, 'need org');
  const orgId = Number(orgs[0].id);
  const [users] = await db.execute<RowDataPacket[]>(
    `SELECT id FROM users ORDER BY id ASC LIMIT 1`
  );
  const userId = Number(users[0].id);

  // Force propose autonomy so full-auto cannot fire without opt-in
  await LoopConfigRepo.update(
    { userId, organizationId: orgId },
    { autonomy: 'propose' }
  );

  const uniqueZip = `9${String(Date.now()).slice(-4)}`;

  const [pIns] = await db.execute<ResultSetHeader>(
    `INSERT INTO person_records
      (organization_id, cluster_key, first_name, last_name, email, phone,
       gender, age_years, age_bucket, owner_occupied, match_confidence,
       latitude, longitude, zip)
     VALUES (?, ?, 'MT3', 'Thin', ?, ?, 'F', 40, '35-44', 1, 0.95, 37.78, -122.42, ?)`,
    [orgId, `mt3-${tag}`, email, phone, uniqueZip]
  );
  const personId = Number(pIns.insertId);

  const [sIns] = await db.execute<ResultSetHeader>(
    `INSERT INTO surveys
      (title, description, slug, created_by, is_public, anonymity_level,
       demographics_required, status, organization_id)
     VALUES (?, 'MT3', ?, ?, 1, 'full', 0, 'published', ?)`,
    [`MT3 Survey ${tag}`, `mt3-${tag}`, userId, orgId]
  );
  const [qIns] = await db.execute<ResultSetHeader>(
    `INSERT INTO survey_questions (survey_id, type, prompt, options, is_required, question_order)
     VALUES (?, 'single-choice', 'Public security', NULL, 1, 1)`,
    [sIns.insertId]
  );
  const [rIns] = await db.execute<ResultSetHeader>(
    `INSERT INTO survey_responses
      (survey_id, demographics, anonymity_level, ip_address, user_agent, agent_token, source)
     VALUES (?, ?, 'full', '127.0.0.1', 'mt3', ?, 'web')`,
    [sIns.insertId, JSON.stringify({ email, phone }), agentToken]
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

  // Thin draft path (mock) — unique ZIP keeps membership at n=1
  const thinDefinition = {
    gender: ['F'],
    minAgeYears: 35,
    ownerOccupied: true as const,
    zip: [uniqueZip],
    tracked: [{ issue: 'public security', equals: 'major concern' }],
  };
  const drafted = await draftOutboundForSegment({
    organizationId: orgId,
    definition: thinDefinition,
    formats: ['sms', 'email', 'letter'],
    mock: true,
    limit: 50,
  });
  assert(drafted.context.voterCount === 1, `expected n=1 got ${drafted.context.voterCount}`);
  assert(drafted.context.thinSegment === true, 'single-member segment is thin');
  assert(
    drafted.drafts.every((d) => d.smallSampleDisclaimerApplied),
    'disclaimer applied to all thin drafts'
  );
  assert(
    drafted.drafts.every((d) => d.body.includes('Small-sample caveat')),
    'disclaimer text in bodies'
  );
  assert(
    drafted.context.statedPositions.length <= 1,
    'coarse: at most one stated position'
  );

  // Pure applyThinSegmentDiscipline
  const ctx = buildTailoringContext({
    id: 't',
    name: 't',
    description: null,
    source: 'preset',
    definition: {},
    count: 8,
    candidateCount: 8,
    people: [],
    disclaimer: 'x',
  });
  assert(ctx.thinSegment, 'ctx thin for n=8');
  const fb = applyThinSegmentDiscipline(fallbackDrafts(ctx, ['sms']), true);
  assert(fb[0].body.includes(SMALL_SAMPLE_DISCLAIMER.slice(0, 20)), 'baked disclaimer');

  // Executor: send_sms always pending without approved
  const gate = await executeTool(
    { name: 'send_sms', input: { to: [phone], body: 'test', approved: true } },
    { userId, organizationId: orgId }
  );
  assert(gate.status === 'pending_approval', 'send_sms gated');
  assert(gate.ok === true, 'gated is ok pending');

  const smsDraft = drafted.drafts.find((d) => d.format === 'sms')!;
  const stagedSms = await stageOutboundDraftSend({
    userId,
    organizationId: orgId,
    draft: smsDraft,
    context: drafted.context,
    segmentId: drafted.context.segmentId,
    fullAutoSend: false,
    dryRun: true,
    recipientOverride: { emails: [email], phones: [phone], personIds: [personId] },
  });
  assert(stagedSms.heldAtGate === true, 'SMS held at gate');
  assert(stagedSms.fullAutoApplied === false, 'no full auto without opt-in');
  assert(stagedSms.toolName === 'send_sms', `tool=${stagedSms.toolName}`);
  assert(stagedSms.status === 'pending_approval', 'pending_approval status');
  assert(stagedSms.thinSegment === true, 'thin flag on stage result');
  assert(stagedSms.smallSampleDisclaimerApplied === true, 'disclaimer flag on stage');

  const stagedRow = await ConsultantRepo.getStagedActionById(stagedSms.stagedActionId);
  assert(stagedRow?.status === 'pending', 'DB pending');
  assert(String(stagedRow?.payload?.tool) === 'send_sms', 'payload tool send_sms');

  // Letter → review-only card
  const letterDraft = drafted.drafts.find((d) => d.format === 'letter')!;
  const stagedLetter = await stageOutboundDraftSend({
    userId,
    organizationId: orgId,
    draft: letterDraft,
    context: drafted.context,
    fullAutoSend: true, // still review-only for letter
    dryRun: true,
    recipientOverride: { emails: [email], phones: [phone], personIds: [personId] },
  });
  assert(stagedLetter.toolName === 'outbound_review', 'letter is review card');
  assert(stagedLetter.status === 'review_only', 'review_only');
  assert(stagedLetter.heldAtGate === true, 'letter held');

  const reviewed = await approveStagedAction({
    userId,
    stagedActionId: stagedLetter.stagedActionId,
  });
  assert(reviewed.staged.status === 'approved', 'review approve marks approved');
  assert(
    reviewed.execution.data?.reviewOnly === true,
    'reviewOnly — no send executed'
  );

  // fullAutoSend under propose still holds (autonomy dial)
  const emailDraft = drafted.drafts.find((d) => d.format === 'email')!;
  const heldDespiteOptIn = await stageOutboundDraftSend({
    userId,
    organizationId: orgId,
    draft: emailDraft,
    context: drafted.context,
    fullAutoSend: true,
    dryRun: true,
    recipientOverride: { emails: [email], phones: [phone], personIds: [personId] },
  });
  assert(heldDespiteOptIn.heldAtGate === true, 'propose + fullAuto still holds at gate');
  assert(heldDespiteOptIn.fullAutoApplied === false, 'propose blocks full auto');
  assert(heldDespiteOptIn.toolName === 'send_email', 'email tool staged');

  console.log(
    JSON.stringify(
      {
        ok: true,
        thinThreshold: THIN_SEGMENT_THRESHOLD,
        voterCount: drafted.context.voterCount,
        stagedSmsId: stagedSms.stagedActionId,
        stagedLetterId: stagedLetter.stagedActionId,
        stagedEmailId: heldDespiteOptIn.stagedActionId,
        autonomy: heldDespiteOptIn.autonomy,
      },
      null,
      2
    )
  );
  console.log(
    'PASS: MT3 — thin-segment disclaimer + drafts route through send_sms/send_email approval gate'
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
