/**
 * AI G3 smoke — usage metering, credit math, soft/hard gate config.
 *
 *   npx tsx --tsconfig tsconfig.json -r dotenv/config scripts/smoke-ai-g3-usage-metering.ts
 */

require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

import {
  AI_PLAN_ALLOWANCES,
  computeCredits,
  getModelRate,
  isAiUsageHardEnforce,
  usdPerCredit,
} from '../src/app/utils/services/ai-usage-config';
import {
  aiComplete,
  DEFAULT_TIER_MODELS,
} from '../src/app/utils/services/ai-service';
import { recordAiUsageEvent } from '../src/app/utils/database/ai-usage-repo';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  console.log('--- credit math ---');
  assert(usdPerCredit() > 0, 'usdPerCredit');
  assert(AI_PLAN_ALLOWANCES.grassroots > 0, 'grassroots allowance');
  assert(
    AI_PLAN_ALLOWANCES.congressional > AI_PLAN_ALLOWANCES.campaign,
    'congressional > campaign'
  );
  assert(!isAiUsageHardEnforce(), 'hard enforce off by default');

  const workhorse = DEFAULT_TIER_MODELS.workhorse;
  const rate = getModelRate(workhorse);
  assert(rate.inputPerMTok > 0 && rate.outputPerMTok > 0, 'rate table');

  const { credits, costUsd } = computeCredits(workhorse, 1_000_000, 0);
  assert(Math.abs(credits - rate.inputPerMTok / usdPerCredit()) < 0.01, '1M in tokens → credits');
  console.log({ workhorse, rate, sample: { credits, costUsd } });

  // Persist a synthetic event (org null) to verify table or soft-fail
  await recordAiUsageEvent({
    organizationId: null,
    userId: null,
    feature: 'smoke-g3',
    tier: 'cheap',
    model: DEFAULT_TIER_MODELS.cheap,
    inputTokens: 10,
    outputTokens: 5,
    usedFallback: false,
  });
  console.log('recordAiUsageEvent ok (or soft-warned)');

  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('ANTHROPIC_API_KEY missing — config-only pass');
    console.log('AI G3 smoke PASSED (config only)');
    return;
  }

  console.log('--- live metered aiComplete ---');
  const res = await aiComplete({
    tier: 'cheap',
    maxTokens: 20,
    messages: [{ role: 'user', content: 'Reply with exactly: meter-ok' }],
    usage: { feature: 'smoke-g3', organizationId: null },
  });
  assert(typeof res.content === 'string', 'content');
  assert(res.usage != null, 'usage present');
  assert((res.usage?.credits ?? 0) >= 0, 'credits computed');
  console.log('served', {
    tier: res.tier,
    model: res.model,
    usage: res.usage,
  });

  console.log('AI G3 smoke PASSED');
  process.exit(0);
}

main().catch((err) => {
  console.error('AI G3 smoke FAILED', err);
  process.exit(1);
});
