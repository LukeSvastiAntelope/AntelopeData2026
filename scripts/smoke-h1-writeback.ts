import { config } from 'dotenv';
config({ path: '.env.local' });
config();

async function main() {
  // Clear empty MYSQL_* overrides that shadow dotenv
  for (const k of ['MYSQL_HOST', 'MYSQL_PORT', 'MYSQL_USER', 'MYSQL_PASSWORD', 'MYSQL_DATABASE']) {
    if (process.env[k] === '') delete process.env[k];
  }
  config({ path: '.env.local', override: true });

  const { LoopConfigRepo, DEFAULT_LOOP_CONFIG } = await import(
    '../src/app/utils/database/loop-config-repo'
  );
  const { AgentSituationService } = await import(
    '../src/app/utils/services/agent-situation-service'
  );
  const { findingsFromContrasts, commitFindingsToSituation } = await import(
    '../src/app/utils/services/situation-writeback-service'
  );
  const { openSql } = await import('../src/app/utils/database/db');

  const db = await openSql();
  const [users]: any = await db.execute(`SELECT id FROM users ORDER BY id ASC LIMIT 1`);
  const userId = Number(users[0]?.id);
  if (!userId) throw new Error('no users');

  // Prefer a survey that already has an organization_id (situation docs are org-scoped)
  const [surveys]: any = await db.execute(
    `SELECT id, organization_id, created_by
     FROM surveys
     WHERE organization_id IS NOT NULL AND organization_id > 0
     ORDER BY id ASC
     LIMIT 1`
  );
  let surveyId = Number(surveys[0]?.id || 0);
  let orgId = Number(surveys[0]?.organization_id || 0);

  if (!orgId) {
    const [sit]: any = await db.execute(
      `SELECT org_id FROM agent_situation_documents ORDER BY org_id ASC LIMIT 1`
    );
    orgId = Number(sit[0]?.org_id || 0);
  }
  if (!orgId) {
    // Use a synthetic org id for personal-scope situation docs (table allows any org_id)
    orgId = 1;
  }
  if (!surveyId) {
    const [anySurvey]: any = await db.execute(`SELECT id FROM surveys ORDER BY id ASC LIMIT 1`);
    surveyId = Number(anySurvey[0]?.id || 0);
  }

  console.log('user', userId, 'org', orgId, 'survey', surveyId);

  const cfg = await LoopConfigRepo.getOrCreate({ userId, organizationId: orgId });
  console.log('loop_config autonomy=', cfg.autonomy, 'defaults_ok=', cfg.autonomy === DEFAULT_LOOP_CONFIG.autonomy);

  const fakeDirectional = {
    groupingField: 'age',
    groupA: '18-34',
    groupB: '35+',
    outcomePrompt: 'Support',
    outcomeValue: 'Yes',
    estimateA: 0.6,
    estimateB: 0.4,
    absoluteEffect: 0.2,
    pCorrected: 0.2,
    nA: 20,
    nB: 25,
    publishable: false,
    flag: 'directional_only' as const,
  } as any;

  const gated = findingsFromContrasts({
    publishable: [{ ...fakeDirectional, publishable: true, flag: 'publishable', pCorrected: 0.01 }],
    directionalOnly: [fakeDirectional],
    provenance: { surveyId: surveyId || 1, channels: ['web'], samplingNote: 'smoke' },
    source: 'smoke',
    includeDirectionalAsContext: true,
  });
  const blocked = findingsFromContrasts({
    publishable: [fakeDirectional],
    provenance: { surveyId: surveyId || 1, channels: ['web'], samplingNote: 'smoke' },
    source: 'smoke',
  });
  console.log(
    'conviction',
    gated.filter((f) => f.role === 'conviction').length,
    'context',
    gated.filter((f) => f.role === 'context').length,
    'blocked',
    blocked.length
  );

  if (!surveyId) {
    console.log('No survey — skip commit');
    process.exit(0);
  }

  const result = await commitFindingsToSituation({
    surveyId,
    orgId,
    userId,
    findings: gated,
    traceId: `h1-smoke-${Date.now()}`,
    changeSummary: 'H1 smoke write-back',
  });
  console.log('commit', result);

  const doc = await AgentSituationService.getCurrent(orgId, 'campaign_consultant');
  console.log(
    'findings',
    doc.snapshot.findings?.length,
    'roles',
    (doc.snapshot.findings || []).slice(0, 5).map((f) => f.role).join(','),
    'version',
    doc.version
  );
  const polluted = (doc.snapshot.nextActions || []).some((a) => a.includes('[directional]'));
  console.log('nextActions_polluted_by_directional', polluted);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
