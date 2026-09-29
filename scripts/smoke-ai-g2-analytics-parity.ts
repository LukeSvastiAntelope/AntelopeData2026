/**
 * AI G2 — analytics tier swap smoke / parity check.
 *
 * Exercises python-analysis style prompts through the Anthropic gateway with
 * the mapped tiers (plan/extract/synthesize → heavy; fix → workhorse; cheap
 * for light classification). Compares structural quality gates — not bit-
 * identical to prior gpt-4o output.
 *
 *   npx tsx --tsconfig tsconfig.json -r dotenv/config scripts/smoke-ai-g2-analytics-parity.ts
 */

require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

import { aiComplete, getModelForTier } from '../src/app/utils/services/ai-service';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const SAMPLE_OUTPUT = `
Crosstab party x support (n=200):
Democrat support=62% (62/100), Republican support=38% (38/100)
chi2=11.52, p=0.0007
`;

async function main() {
  console.log('--- tier mapping ---');
  assert(getModelForTier('heavy').length > 0, 'heavy model');
  assert(getModelForTier('workhorse').length > 0, 'workhorse model');
  assert(getModelForTier('cheap').length > 0, 'cheap model');
  console.log({
    heavy: getModelForTier('heavy'),
    workhorse: getModelForTier('workhorse'),
    cheap: getModelForTier('cheap'),
  });

  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('ANTHROPIC_API_KEY missing — config-only pass');
    console.log('AI G2 analytics parity PASSED (config only)');
    return;
  }

  console.log('--- plan-steps style (heavy) ---');
  const plan = await aiComplete({
    tier: 'heavy',
    maxTokens: 600,
    system:
      'You plan survey data analysis steps. Return ONLY a JSON array of objects with keys id, type, description.',
    messages: [
      {
        role: 'user',
        content:
          'Dataset columns: age, party, support (0/1). Question: Is support associated with party? Plan 3 steps.',
      },
    ],
  });
  const planText = plan.content.replace(/```json|```/g, '').trim();
  const planJsonStart = planText.indexOf('[');
  assert(planJsonStart >= 0, 'plan returns JSON array');
  const steps = JSON.parse(planText.slice(planJsonStart));
  assert(Array.isArray(steps) && steps.length >= 2, 'at least 2 steps');
  console.log('plan steps', steps.length, 'served', plan.tier, plan.model);

  console.log('--- extract-insights style (heavy) ---');
  const extract = await aiComplete({
    tier: 'heavy',
    maxTokens: 400,
    system:
      'Extract insights ONLY from numbers literally present in the STEP OUTPUT. Return JSON: {"insights":[...]}',
    messages: [
      {
        role: 'user',
        content: `STEP OUTPUT:\n"""\n${SAMPLE_OUTPUT}\n"""\nReturn JSON only.`,
      },
    ],
  });
  const extractRaw = extract.content.replace(/```json|```/g, '').trim();
  const extractObj = JSON.parse(
    extractRaw.slice(extractRaw.indexOf('{'), extractRaw.lastIndexOf('}') + 1)
  );
  assert(Array.isArray(extractObj.insights), 'insights array');
  const joined = extractObj.insights.join(' ').toLowerCase();
  // Must ground in sample numbers
  assert(
    joined.includes('62') || joined.includes('0.0007') || joined.includes('11.52'),
    'insights cite sample numbers'
  );
  console.log('insights', extractObj.insights.length, 'served', extract.tier);

  console.log('--- synthesize style (heavy) ---');
  const synth = await aiComplete({
    tier: 'heavy',
    maxTokens: 500,
    system: 'Write a short executive summary grounded only in the findings.',
    messages: [
      {
        role: 'user',
        content: `Question: Is support associated with party?\nFindings:\n${SAMPLE_OUTPUT}`,
      },
    ],
  });
  assert(synth.content.trim().length > 40, 'synthesis non-empty');
  assert(
    /party|support|significant|association|democrat|republican/i.test(synth.content),
    'synthesis on-topic'
  );
  console.log('synth preview', synth.content.slice(0, 160).replace(/\n/g, ' '));

  console.log('--- cheap classification ---');
  const cheap = await aiComplete({
    tier: 'cheap',
    maxTokens: 40,
    messages: [
      {
        role: 'user',
        content:
          'Classify analysis type as one word: statistical | exploratory | visualization. Query: "correlation between age and support"',
      },
    ],
  });
  assert(/statistical|exploratory|visualization/i.test(cheap.content), 'cheap classifies');
  console.log('cheap', cheap.content.trim(), 'served', cheap.tier);

  console.log('AI G2 analytics parity PASSED');
}

main().catch((err) => {
  console.error('AI G2 analytics parity FAILED', err);
  process.exit(1);
});
