/**
 * AI G1 smoke — Anthropic-only tiered gateway + internal fallback.
 *
 *   npx tsx --tsconfig tsconfig.json -r dotenv/config scripts/smoke-ai-g1-gateway.ts
 */

require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

import {
  DEFAULT_TIER_MODELS,
  TIER_FALLBACK,
  getModelForTier,
  getTierModels,
  resolveModelTier,
  aiComplete,
  createCompletion,
} from '../src/app/utils/services/ai-service';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  console.log('--- tier config ---');
  const tiers = getTierModels();
  assert(tiers.workhorse === (process.env.ANTHROPIC_MODEL_WORKHORSE?.trim() || DEFAULT_TIER_MODELS.workhorse), 'workhorse');
  assert(tiers.heavy === (process.env.ANTHROPIC_MODEL_HEAVY?.trim() || DEFAULT_TIER_MODELS.heavy), 'heavy');
  assert(tiers.cheap === (process.env.ANTHROPIC_MODEL_CHEAP?.trim() || DEFAULT_TIER_MODELS.cheap), 'cheap');
  assert(TIER_FALLBACK.workhorse === 'cheap', 'workhorse→cheap');
  assert(TIER_FALLBACK.heavy === 'workhorse', 'heavy→workhorse');
  assert(TIER_FALLBACK.cheap === null, 'cheap has no fallback');
  console.log('tiers', tiers);

  console.log('--- resolveModelTier ---');
  assert(resolveModelTier('workhorse') === 'workhorse', 'tier name');
  assert(resolveModelTier('claude-sonnet-4-6') === 'workhorse', 'legacy sonnet');
  assert(resolveModelTier('claude-sonnet-4-20250514') === 'workhorse', 'retired sonnet');
  assert(resolveModelTier('claude-opus-4-8') === 'heavy', 'opus→heavy');
  assert(resolveModelTier('claude-haiku-4-5-20251001') === 'cheap', 'haiku→cheap');
  assert(resolveModelTier('gpt-4o') === 'workhorse', 'gpt coerced');
  assert(getModelForTier('workhorse') === tiers.workhorse, 'getModelForTier');

  // No literal retired id outside gateway defaults
  const retired = 'claude-sonnet-4-20250514';
  assert(
    !Object.values(DEFAULT_TIER_MODELS).includes(retired),
    'retired model not in defaults'
  );

  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('ANTHROPIC_API_KEY missing — skipping live call');
    console.log('AI G1 smoke PASSED (config only)');
    return;
  }

  console.log('--- aiComplete workhorse ---');
  const res = await aiComplete({
    tier: 'workhorse',
    maxTokens: 40,
    messages: [
      { role: 'user', content: 'Reply with exactly: gateway-ok' },
    ],
  });
  assert(typeof res.content === 'string', 'content');
  assert(res.tier === 'workhorse' || res.usedFallback, 'tier or fallback');
  assert(!!res.model, 'model served');
  console.log('served', {
    tier: res.tier,
    model: res.model,
    usedFallback: res.usedFallback,
    preview: res.content.slice(0, 80),
  });

  console.log('--- createCompletion compat (legacy model id) ---');
  const compat = await createCompletion({
    model: 'claude-sonnet-4-6',
    maxTokens: 20,
    messages: [{ role: 'user', content: 'Say hi in one word.' }],
  });
  assert(compat.tier === 'workhorse' || compat.usedFallback, 'compat resolves');
  console.log('compat', { tier: compat.tier, model: compat.model });

  console.log('AI G1 smoke PASSED');
}

main().catch((err) => {
  console.error('AI G1 smoke FAILED', err);
  process.exit(1);
});
