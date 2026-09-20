/**
 * AT3 smoke — propose holds at gate; auto posts recommendation without
 * silently promoting sends; full_auto still respects dryRun / executor path.
 *
 *   npx tsx --tsconfig tsconfig.json -r dotenv/config scripts/smoke-at3-autonomy.ts
 */

import { closePool, openSql } from '../src/app/utils/database/db';
import { ConsultantRepo } from '../src/app/utils/database/consultant-repo';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import {
  generateAndStageAutotriggerOutputs,
  type FindingDraftSource,
} from '../src/app/utils/services/autotrigger-outputs';
import {
  applyAutotriggerAutonomy,
  resolveEffectiveAutonomy,
} from '../src/app/utils/services/autotrigger-autonomy';
import { POSTABLE_INSIGHT_THRESHOLDS } from '../src/app/utils/services/postable-insight-service';

require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  assert(
    resolveEffectiveAutonomy({
      surveyAutonomy: 'auto',
      loopAutonomy: 'manual',
    }) === 'propose',
    'org manual must cap survey auto → propose'
  );
  assert(
    resolveEffectiveAutonomy({
      surveyAutonomy: 'auto',
      loopAutonomy: 'auto_within_limits',
    }) === 'auto',
    'survey auto under auto_within_limits stays auto'
  );

  const db = await openSql();
  const [users] = await db.execute<RowDataPacket[]>(
    `SELECT id FROM users ORDER BY id ASC LIMIT 1`
  );
  assert(users[0]?.id != null, 'need user');
  const userId = Number(users[0].id);
  const [orgs] = await db.execute<RowDataPacket[]>(
    `SELECT id FROM organizations ORDER BY id ASC LIMIT 1`
  );
  const orgId = orgs[0]?.id != null ? Number(orgs[0].id) : null;

  const tag = `at3_${Date.now()}`;
  const [ins] = await db.execute<ResultSetHeader>(
    `INSERT INTO surveys
      (title, description, slug, created_by, is_public, anonymity_level,
       demographics_required, status, organization_id)
     VALUES (?, 'AT3 smoke', ?, ?, 1, 'full', 0, 'published', ?)`,
    [`AT3 Smoke ${tag}`, `at3-smoke-${tag}`, userId, orgId]
  );
  const surveyId = Number(ins.insertId);

  const finding: FindingDraftSource = {
    claim: 'Publishable contrast on housing',
    caveat: 'cleared gate',
    nA: POSTABLE_INSIGHT_THRESHOLDS.minCellSize + 10,
    nB: POSTABLE_INSIGHT_THRESHOLDS.minCellSize + 12,
    flag: 'publishable',
    totalResponses: POSTABLE_INSIGHT_THRESHOLDS.minTotalResponses + 40,
    groupingField: 'party',
  };

  const staged = await generateAndStageAutotriggerOutputs({
    surveyId,
    surveyTitle: `AT3 Smoke ${tag}`,
    userId,
    organizationId: orgId,
    actions: ['newsletter', 'video'],
    finding,
    options: { mockOutputs: true, skipVideoGenerate: true },
  });
  assert(staged.drafts.length === 2, 'need drafts');

  // propose → hold at gate, still recommend
  const propose = await applyAutotriggerAutonomy({
    surveyId,
    surveyTitle: `AT3 Smoke ${tag}`,
    userId,
    organizationId: orgId,
    surveyAutonomy: 'propose',
    fullAutoSend: false,
    finding,
    drafts: staged.drafts,
    dryRun: true,
  });
  assert(propose.mode === 'propose', 'propose mode');
  assert(propose.sendsExecuted.length === 0, 'propose must not execute sends');
  assert(propose.sendsHeldAtGate.length === 2, 'drafts wait at gate');
  assert(propose.recommendationStagedId != null, 'recommendation staged');
  assert(propose.recommendationAction != null, 'recommendation action');

  // auto without full_auto → recommendation + gate
  const auto = await applyAutotriggerAutonomy({
    surveyId,
    surveyTitle: `AT3 Smoke ${tag}`,
    userId,
    organizationId: orgId,
    surveyAutonomy: 'auto',
    fullAutoSend: false,
    finding,
    drafts: staged.drafts,
    dryRun: true,
  });
  assert(auto.mode === 'auto', 'auto mode');
  assert(auto.fullAutoApplied === false, 'no silent promote');
  assert(auto.skippedSendReason === 'full_auto_send_off', 'reason full_auto off');
  assert(auto.recommendationStagedId != null, 'auto still recommends');

  // full_auto + dryRun → still does not executeApprovedTool
  const fullDry = await applyAutotriggerAutonomy({
    surveyId,
    surveyTitle: `AT3 Smoke ${tag}`,
    userId,
    organizationId: orgId,
    surveyAutonomy: 'auto',
    fullAutoSend: true,
    finding,
    drafts: staged.drafts,
    dryRun: true,
  });
  assert(fullDry.fullAutoApplied === false, 'dryRun blocks full auto execute');
  assert(fullDry.skippedSendReason === 'dry_run', 'dry_run reason');

  // Cleanup staged actions created in this smoke
  const conversation = await ConsultantRepo.getOrCreateConversation({
    userId,
    organizationId: orgId,
  });
  const ids = [
    ...staged.drafts.map((d) => d.stagedActionId),
    propose.recommendationStagedId,
    auto.recommendationStagedId,
    fullDry.recommendationStagedId,
  ].filter((x): x is number => x != null);
  if (ids.length) {
    await db.execute(
      `DELETE FROM consultant_staged_actions WHERE conversation_id = ? AND id IN (${ids
        .map(() => '?')
        .join(',')})`,
      [conversation.id, ...ids]
    );
  }
  await db.execute(`DELETE FROM surveys WHERE id = ?`, [surveyId]);

  console.log(
    'PASS: AT3 — propose holds at gate; auto recommends without silent promote; full_auto respects dryRun/executor'
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
