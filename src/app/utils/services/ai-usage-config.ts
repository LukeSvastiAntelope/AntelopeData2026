/**
 * AI usage metering config — rates, credit conversion, plan allowances.
 * Model prices live here (not scattered); override via env when needed.
 */

export type ModelTier = 'workhorse' | 'heavy' | 'cheap';

export type AiPlanTier = 'grassroots' | 'campaign' | 'congressional';

export const AI_PLAN_TIERS: AiPlanTier[] = [
  'grassroots',
  'campaign',
  'congressional',
];

export const AI_PLAN_LABELS: Record<AiPlanTier, string> = {
  grassroots: 'Grassroots',
  campaign: 'Campaign',
  congressional: 'Congressional',
};

/** Monthly credit allowances by pricing tier. */
export const AI_PLAN_ALLOWANCES: Record<AiPlanTier, number> = {
  grassroots: Number(process.env.AI_CREDITS_GRASSROOTS || 5_000),
  campaign: Number(process.env.AI_CREDITS_CAMPAIGN || 25_000),
  congressional: Number(process.env.AI_CREDITS_CONGRESSIONAL || 100_000),
};

/** Warn when used/allowance >= this ratio (soft limit). */
export const AI_USAGE_WARN_RATIO = Number(
  process.env.AI_USAGE_WARN_RATIO || 0.8
);

/**
 * Hard-block new AI calls when over allowance.
 * Off by default — metering ships without breakage risk.
 */
export function isAiUsageHardEnforce(): boolean {
  const v = String(process.env.AI_USAGE_HARD_ENFORCE || '')
    .trim()
    .toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/**
 * USD per 1M tokens. Keys are concrete model ids from the gateway tier config.
 * Env overrides: AI_RATE_<MODEL>_IN / _OUT with model id uppercased and
 * non-alnum → underscore (e.g. AI_RATE_CLAUDE_SONNET_5_IN).
 */
export type ModelRate = { inputPerMTok: number; outputPerMTok: number };

/** Defaults aligned with ai-service DEFAULT_TIER_MODELS — keep in sync. */
const DEFAULT_RATES: Record<string, ModelRate> = {
  'claude-sonnet-5': { inputPerMTok: 3.0, outputPerMTok: 15.0 },
  'claude-opus-5-5': { inputPerMTok: 15.0, outputPerMTok: 75.0 },
  'claude-haiku-4-5-20251001': { inputPerMTok: 1.0, outputPerMTok: 5.0 },
};

function envRateKey(modelId: string, side: 'IN' | 'OUT'): string {
  const slug = modelId.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  return `AI_RATE_${slug}_${side}`;
}

export function getModelRate(modelId: string): ModelRate {
  const fallback: ModelRate = DEFAULT_RATES[modelId] || {
    inputPerMTok: 3,
    outputPerMTok: 15,
  };
  const inEnv = process.env[envRateKey(modelId, 'IN')];
  const outEnv = process.env[envRateKey(modelId, 'OUT')];
  return {
    inputPerMTok: inEnv ? Number(inEnv) : fallback.inputPerMTok,
    outputPerMTok: outEnv ? Number(outEnv) : fallback.outputPerMTok,
  };
}

/** 1 credit = $0.001 USD of computed API cost (env-overridable). */
export function usdPerCredit(): number {
  const n = Number(process.env.AI_USD_PER_CREDIT || 0.001);
  return n > 0 ? n : 0.001;
}

export function computeCostUsd(
  modelId: string,
  inputTokens: number,
  outputTokens: number
): number {
  const rate = getModelRate(modelId);
  const inTok = Math.max(0, Number(inputTokens) || 0);
  const outTok = Math.max(0, Number(outputTokens) || 0);
  return (
    (inTok / 1_000_000) * rate.inputPerMTok +
    (outTok / 1_000_000) * rate.outputPerMTok
  );
}

export function computeCredits(
  modelId: string,
  inputTokens: number,
  outputTokens: number
): { costUsd: number; credits: number } {
  const costUsd = computeCostUsd(modelId, inputTokens, outputTokens);
  const credits = costUsd / usdPerCredit();
  return {
    costUsd: Math.round(costUsd * 1e6) / 1e6,
    credits: Math.round(credits * 1e4) / 1e4,
  };
}

export function isAiPlanTier(v: unknown): v is AiPlanTier {
  return v === 'grassroots' || v === 'campaign' || v === 'congressional';
}

export function allowanceForPlan(
  plan: AiPlanTier,
  override?: number | null
): number {
  if (override != null && Number.isFinite(override) && override > 0) {
    return Math.floor(override);
  }
  return AI_PLAN_ALLOWANCES[plan] ?? AI_PLAN_ALLOWANCES.grassroots;
}

export function inferPlanFromOfficeType(
  officeType: string | null | undefined
): AiPlanTier {
  const t = String(officeType || '').toLowerCase();
  if (
    t === 'federal_house' ||
    t === 'federal_senate' ||
    t === 'president'
  ) {
    return 'congressional';
  }
  if (t === 'governor' || t === 'state_senate' || t === 'state_house') {
    return 'campaign';
  }
  return 'grassroots';
}

/** Current UTC calendar-month window [start, end). */
export function currentUsagePeriod(now = new Date()): {
  start: Date;
  end: Date;
  label: string;
} {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0)
  );
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0)
  );
  const label = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}`;
  return { start, end, label };
}

export function defaultRateTable(): Array<{
  model: string;
  inputPerMTok: number;
  outputPerMTok: number;
}> {
  return Object.entries(DEFAULT_RATES).map(([model, rate]) => ({
    model,
    ...rate,
  }));
}
