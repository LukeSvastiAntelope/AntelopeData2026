import { config as dotenv } from 'dotenv';
dotenv({ path: '.env.local' });
process.env.ANALYTICS_CONTEXT_INJECTION = 'true';

import { writeFileSync } from 'fs';
import {
  buildAnalyticsContext,
  formatAnalyticsContextForPrompt,
} from '../src/app/utils/services/analytics-context-service';
import { AIAnalyticsOrchestrator } from '../src/app/utils/services/ai-analytics-orchestrator';

async function main() {
  const surveyId = 7;
  const ctx = await buildAnalyticsContext(surveyId, 1);
  console.log(
    'CONTEXT_SOURCES',
    JSON.stringify({ included: ctx.sourcesIncluded, missing: ctx.sourcesMissing })
  );
  console.log('DISTRICT_CODE', ctx.organization?.districtCode, ctx.districtProfile?.districtCode);
  console.log('CONTEXT_PREVIEW\n', formatAnalyticsContextForPrompt(ctx).slice(0, 1200));

  const orch = new AIAnalyticsOrchestrator({
    analysisModel: 'claude-sonnet-4-6',
    queryModel: 'claude-sonnet-4-6',
    insightModel: 'claude-sonnet-4-6',
    visualizationModel: 'claude-sonnet-4-6',
  });

  await orch.clearAnalyticsCache(surveyId);

  const result = await orch.generateCompleteAnalytics(surveyId, {
    forceRegenerate: true,
    forceRegenerateInsights: true,
    enableContextInjection: true,
    campaignId: 1,
    minimumResponses: 10,
    insightModel: 'claude-sonnet-4-6',
    analysisModel: 'claude-sonnet-4-6',
    queryModel: 'claude-sonnet-4-6',
    visualizationModel: 'claude-sonnet-4-6',
  });

  const insights: any = result.insights || {};
  const summary = String(insights.executiveSummary || '');
  const findings = (insights.keyFindings || [])
    .map((f: any) => `${f.title} | ${f.statisticalEvidence}`)
    .join('\n');
  const chart0 = result.dashboard?.charts?.[0]?.insights;
  const blob = `${JSON.stringify(insights)} ${summary}`.toLowerCase();
  const refsDistrict = /nj-?5|bergen|passaic|pvi|district|incumbent|new jersey|verify candidate/.test(
    blob
  );

  console.log('\n=== VERIFY B ===');
  console.log('status', result.status);
  console.log('models', JSON.stringify(result.metadata?.modelsUsed));
  console.log('contextSources', JSON.stringify(insights.contextSourcesIncluded || []));
  console.log('executiveSummary', summary.slice(0, 600));
  console.log('keyFindingsSample', findings.slice(0, 900));
  console.log('chart0', JSON.stringify(chart0)?.slice(0, 500));
  console.log('chartSource', chart0?.source);
  console.log('refsDistrictOrCampaign', refsDistrict);
  console.log('responseCount', result.dataQuality?.responseCount);

  const firstQr = result.queryResults?.find(
    (q: any) => q.success && Array.isArray(q.data) && q.data[0]?.count != null
  );
  if (firstQr) {
    const counts = firstQr.data.slice(0, 3).map((r: any) => String(r.count));
    const evidenceBlob = JSON.stringify(insights);
    const numbersPresent = counts.filter((n: string) => evidenceBlob.includes(n));
    console.log('statNumbersInInsights', { sampleCounts: counts, matched: numbersPresent });
  }

  writeFileSync(
    '/tmp/verify-b-result.json',
    JSON.stringify(
      {
        summary,
        contextSourcesIncluded: insights.contextSourcesIncluded,
        keyFindings: insights.keyFindings?.slice(0, 3),
        chart0,
        refsDistrict,
        modelsUsed: result.metadata?.modelsUsed,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error('VERIFY_FAILED', e);
  process.exit(1);
});
