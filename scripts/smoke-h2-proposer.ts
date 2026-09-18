/**
 * H2 smoke: discipline gates + forced proposer pass (stages propose_cycle_action).
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config();
for (const k of ['MYSQL_HOST', 'MYSQL_PORT', 'MYSQL_USER', 'MYSQL_PASSWORD', 'MYSQL_DATABASE']) {
  if (process.env[k] === '') delete process.env[k];
}
config({ path: '.env.local', override: true });

async function main() {
  const { openSql } = await import('../src/app/utils/database/db');
  const {
    applySelfConfirmationGuard,
    canRecommendPivot,
    weightFindingsByMemory,
  } = await import('../src/app/utils/services/loop/discipline');
  const { AgentSituationService } = await import(
    '../src/app/utils/services/agent-situation-service'
  );
  const { runProposerPass } = await import('../src/app/utils/services/loop/proposer');
  const { assertRegistryRiskIntegrity, getTool } = await import(
    '../src/app/utils/services/tools/registry'
  );

  assertRegistryRiskIntegrity();
  const tool = getTool('propose_cycle_action');
  if (!tool || tool.risk !== 'approval') {
    throw new Error('propose_cycle_action must be risk=approval');
  }
  console.log('registry ok: propose_cycle_action risk=', tool.risk);

  const marketingFinding = {
    claim: 'sms lift',
    confidence: { effect: 0.2, pCorrected: 0.01, nPerGroup: { groupA: 'a', nA: 40, groupB: 'b', nB: 40 } },
    sampleProvenance: {
      surveyId: 1,
      channels: ['sms', 'mailchimp'],
      samplingNote: 'Respondents from prior cycle outbound SMS blast',
    },
    source: 'test',
    timestamp: new Date().toISOString(),
    role: 'conviction' as const,
  };
  const guard = applySelfConfirmationGuard(marketingFinding);
  console.log('self_confirmation_downweighted', guard.downweighted, 'mult', guard.weightMultiplier);
  if (!guard.downweighted) throw new Error('expected marketing sample to be downweighted');

  const soft = weightFindingsByMemory(
    [
      {
        ...marketingFinding,
        sampleProvenance: { surveyId: 1, channels: ['web'], samplingNote: 'organic' },
        confidence: { effect: 0.05, pCorrected: 0.2, nPerGroup: { groupA: 'a', nA: 10, groupB: 'b', nB: 10 } },
      },
    ],
    { lookbackCycles: 3, decayHalfLife: 14 }
  );
  const pivotSoft = canRecommendPivot(soft);
  console.log('pivot_on_soft', pivotSoft.ok, pivotSoft.reason);
  if (pivotSoft.ok) throw new Error('pivot must be blocked on soft single signal');

  const db = await openSql();
  const [users]: any = await db.execute(`SELECT id FROM users ORDER BY id ASC LIMIT 1`);
  const userId = Number(users[0]?.id);
  const [orgs]: any = await db.execute(
    `SELECT organization_id AS id FROM surveys WHERE organization_id IS NOT NULL AND organization_id > 0 LIMIT 1`
  );
  let orgId = Number(orgs?.[0]?.id || 0);
  if (!orgId) {
    const [sit]: any = await db.execute(
      `SELECT org_id AS id FROM agent_situation_documents ORDER BY org_id ASC LIMIT 1`
    );
    orgId = Number(sit?.[0]?.id || 1);
  }

  await AgentSituationService.recordHumanDirective({
    orgId,
    text: 'focus on housing, not childcare',
    source: `user:${userId || 1}`,
  });
  console.log('directive recorded for org', orgId);

  const result = await runProposerPass({
    orgId,
    userId: userId || undefined,
    force: true,
  });
  console.log('proposer', {
    ran: result.ran,
    action: result.action,
    stagedActionId: result.stagedActionId,
    skippedReason: result.skippedReason,
    version: result.situationVersion,
  });
  if (!result.ran) throw new Error(`proposer did not run: ${result.skippedReason}`);
  if (!result.stagedActionId) throw new Error('expected staged action id');
  if (!result.reasoningTrace?.includes('what I saw')) {
    throw new Error('reasoning trace missing what I saw');
  }

  const doc = await AgentSituationService.getCurrent(orgId, 'campaign_consultant');
  console.log('loopMeta', doc.snapshot.loopMeta);
  console.log('directives', doc.snapshot.humanDirectives?.slice(0, 1));
  console.log('H2 smoke OK');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
