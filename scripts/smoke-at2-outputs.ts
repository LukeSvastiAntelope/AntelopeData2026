/**
 * AT2 unit + DB smoke: disclaimer bake-in, publishable + thin drafts staged.
 *
 *   npx tsx --tsconfig tsconfig.json -r dotenv/config scripts/smoke-at2-outputs.ts
 */

import { closePool, openSql } from '../src/app/utils/database/db';
import { ConsultantRepo } from '../src/app/utils/database/consultant-repo';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import {
  SMALL_SAMPLE_DISCLAIMER,
  bakeDisclaimerIntoText,
  needsSmallSampleDisclaimer,
  generateAndStageAutotriggerOutputs,
  type FindingDraftSource,
} from '../src/app/utils/services/autotrigger-outputs';
import { POSTABLE_INSIGHT_THRESHOLDS } from '../src/app/utils/services/postable-insight-service';

require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  // --- unit: disclaimer rules ---
  const thin: FindingDraftSource = {
    claim: 'Democrats favor X more than Independents',
    caveat: 'directional',
    nA: 12,
    nB: 14,
    flag: 'directional_only',
    totalResponses: 40,
  };
  assert(needsSmallSampleDisclaimer(thin), 'directional must need disclaimer');

  const publishableComfortable: FindingDraftSource = {
    claim: 'Large clear contrast',
    caveat: 'cleared gate',
    nA: POSTABLE_INSIGHT_THRESHOLDS.minCellSize + 5,
    nB: POSTABLE_INSIGHT_THRESHOLDS.minCellSize + 8,
    flag: 'publishable',
    totalResponses: POSTABLE_INSIGHT_THRESHOLDS.minTotalResponses + 20,
  };
  assert(
    !needsSmallSampleDisclaimer(publishableComfortable),
    'comfortable publishable should not force disclaimer'
  );

  const baked = bakeDisclaimerIntoText('Hello voters.', true, 'newsletter');
  assert(baked.includes(SMALL_SAMPLE_DISCLAIMER), 'disclaimer baked into newsletter');
  const caption = bakeDisclaimerIntoText('Watch this.', true, 'caption');
  assert(caption.includes(SMALL_SAMPLE_DISCLAIMER), 'disclaimer baked into caption');

  // --- DB: stage both draft kinds ---
  const db = await openSql();
  const [users] = await db.execute<RowDataPacket[]>(
    `SELECT id FROM users ORDER BY id ASC LIMIT 1`
  );
  assert(users[0]?.id != null, 'need a user');
  const userId = Number(users[0].id);

  const [orgs] = await db.execute<RowDataPacket[]>(
    `SELECT id FROM organizations ORDER BY id ASC LIMIT 1`
  );
  const orgId = orgs[0]?.id != null ? Number(orgs[0].id) : null;

  const tag = `at2_${Date.now()}`;
  const [ins] = await db.execute<ResultSetHeader>(
    `INSERT INTO surveys
      (title, description, slug, created_by, is_public, anonymity_level,
       demographics_required, status, organization_id)
     VALUES (?, 'AT2 smoke', ?, ?, 1, 'full', 0, 'published', ?)`,
    [`AT2 Smoke ${tag}`, `at2-smoke-${tag}`, userId, orgId]
  );
  const surveyId = Number(ins.insertId);

  // Publishable-path draft (comfortable ns — no disclaimer required by gate)
  const pubOut = await generateAndStageAutotriggerOutputs({
    surveyId,
    surveyTitle: `AT2 Smoke ${tag}`,
    userId,
    organizationId: orgId,
    actions: ['newsletter', 'video'],
    finding: publishableComfortable,
    options: { mockOutputs: true, skipVideoGenerate: true },
  });
  assert(pubOut.drafts.length === 2, 'publishable → newsletter + video');
  assert(
    pubOut.drafts.every((d) => d.disclaimerApplied === false),
    'comfortable publishable drafts without forced disclaimer'
  );

  // Thin finding — disclaimer mandatory in both
  const thinOut = await generateAndStageAutotriggerOutputs({
    surveyId,
    surveyTitle: `AT2 Smoke ${tag}`,
    userId,
    organizationId: orgId,
    actions: ['newsletter', 'video'],
    finding: thin,
    options: { mockOutputs: true, skipVideoGenerate: true },
  });
  assert(thinOut.drafts.length === 2, 'thin → newsletter + video');
  assert(
    thinOut.drafts.every((d) => d.disclaimerApplied === true),
    'thin drafts must flag disclaimerApplied'
  );
  assert(
    thinOut.drafts.every((d) => d.bodyOrCaption.includes(SMALL_SAMPLE_DISCLAIMER)),
    'disclaimer text must be in newsletter body and video caption'
  );

  // Verify staged actions attached via conversation payload.surveyId
  for (const d of [...pubOut.drafts, ...thinOut.drafts]) {
    const staged = await ConsultantRepo.getStagedActionById(d.stagedActionId);
    assert(staged != null && staged.status === 'pending', 'staged pending');
    assert(
      Number((staged!.payload as any).surveyId) === surveyId,
      'payload.surveyId attached'
    );
  }

  // Cleanup staged + conversation noise for this smoke (best-effort)
  const conversation = await ConsultantRepo.getOrCreateConversation({
    userId,
    organizationId: orgId,
  });
  await db.execute(
    `DELETE FROM consultant_staged_actions WHERE conversation_id = ? AND id IN (?, ?, ?, ?)`,
    [
      conversation.id,
      pubOut.drafts[0].stagedActionId,
      pubOut.drafts[1].stagedActionId,
      thinOut.drafts[0].stagedActionId,
      thinOut.drafts[1].stagedActionId,
    ]
  );
  await db.execute(`DELETE FROM surveys WHERE id = ?`, [surveyId]);

  console.log(
    'PASS: AT2 — publishable drafts + thin drafts with baked-in small-sample disclaimer, staged on survey'
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
