/**
 * Persist and aggregate AI usage events (tenant-scoped).
 */

import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { openSql } from '@/app/utils/database/db';
import {
  AI_PLAN_LABELS,
  AI_USAGE_WARN_RATIO,
  allowanceForPlan,
  computeCredits,
  currentUsagePeriod,
  isAiPlanTier,
  isAiUsageHardEnforce,
  type AiPlanTier,
} from '@/app/utils/services/ai-usage-config';

export type AiUsageEventInput = {
  organizationId?: number | null;
  userId?: number | null;
  feature?: string;
  tier: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  usedFallback?: boolean;
};

export type OrgAiUsageSummary = {
  organizationId: number;
  organizationName: string | null;
  planTier: AiPlanTier;
  planLabel: string;
  allowance: number;
  usedCredits: number;
  remainingCredits: number;
  percentUsed: number;
  warn: boolean;
  hardEnforce: boolean;
  blocked: boolean;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  callCount: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
};

function toMysqlDatetime(d: Date): string {
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

export async function recordAiUsageEvent(
  input: AiUsageEventInput
): Promise<void> {
  const { costUsd, credits } = computeCredits(
    input.model,
    input.inputTokens,
    input.outputTokens
  );
  const feature = String(input.feature || 'general').slice(0, 64);
  const tier = String(input.tier || 'workhorse').slice(0, 32);
  const model = String(input.model || '').slice(0, 128);
  const orgId =
    input.organizationId != null && Number(input.organizationId) > 0
      ? Number(input.organizationId)
      : null;
  const userId =
    input.userId != null && Number(input.userId) > 0
      ? Number(input.userId)
      : null;

  try {
    const db = await openSql();
    await db.execute<ResultSetHeader>(
      `INSERT INTO ai_usage_events
        (organization_id, user_id, feature, tier, model,
         input_tokens, output_tokens, credits, cost_usd, used_fallback)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orgId,
        userId,
        feature,
        tier,
        model,
        Math.max(0, Math.floor(input.inputTokens || 0)),
        Math.max(0, Math.floor(input.outputTokens || 0)),
        credits,
        costUsd,
        input.usedFallback ? 1 : 0,
      ]
    );
  } catch (err) {
    // Never fail the AI call because metering write failed (missing table, etc.)
    console.warn(
      '[ai-usage] failed to persist event',
      err instanceof Error ? err.message : err
    );
  }
}

export async function getOrgPlan(
  organizationId: number
): Promise<{
  planTier: AiPlanTier;
  allowanceOverride: number | null;
  name: string | null;
}> {
  const db = await openSql();
  try {
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT name, ai_plan_tier, ai_credit_allowance_override
       FROM organizations WHERE id = ? LIMIT 1`,
      [organizationId]
    );
    const row = rows[0];
    if (!row) {
      return { planTier: 'grassroots', allowanceOverride: null, name: null };
    }
    const plan = isAiPlanTier(row.ai_plan_tier)
      ? row.ai_plan_tier
      : 'grassroots';
    const override =
      row.ai_credit_allowance_override != null
        ? Number(row.ai_credit_allowance_override)
        : null;
    return {
      planTier: plan,
      allowanceOverride: Number.isFinite(override as number)
        ? (override as number)
        : null,
      name: row.name != null ? String(row.name) : null,
    };
  } catch (err) {
    // Column may not exist yet before migration
    console.warn(
      '[ai-usage] getOrgPlan failed',
      err instanceof Error ? err.message : err
    );
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT name FROM organizations WHERE id = ? LIMIT 1`,
      [organizationId]
    );
    return {
      planTier: 'grassroots',
      allowanceOverride: null,
      name: rows[0]?.name != null ? String(rows[0].name) : null,
    };
  }
}

export async function sumOrgCreditsInPeriod(
  organizationId: number,
  start: Date,
  end: Date
): Promise<{
  credits: number;
  callCount: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}> {
  try {
    const db = await openSql();
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT
         COALESCE(SUM(credits), 0) AS credits,
         COUNT(*) AS call_count,
         COALESCE(SUM(input_tokens), 0) AS input_tokens,
         COALESCE(SUM(output_tokens), 0) AS output_tokens,
         COALESCE(SUM(cost_usd), 0) AS cost_usd
       FROM ai_usage_events
       WHERE organization_id = ?
         AND created_at >= ?
         AND created_at < ?`,
      [organizationId, toMysqlDatetime(start), toMysqlDatetime(end)]
    );
    const r = (rows[0] || {}) as RowDataPacket;
    return {
      credits: Number(r.credits) || 0,
      callCount: Number(r.call_count) || 0,
      inputTokens: Number(r.input_tokens) || 0,
      outputTokens: Number(r.output_tokens) || 0,
      costUsd: Number(r.cost_usd) || 0,
    };
  } catch (err) {
    console.warn(
      '[ai-usage] sumOrgCreditsInPeriod failed',
      err instanceof Error ? err.message : err
    );
    return {
      credits: 0,
      callCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
    };
  }
}

export async function getOrgUsageSummary(
  organizationId: number
): Promise<OrgAiUsageSummary> {
  const period = currentUsagePeriod();
  const plan = await getOrgPlan(organizationId);
  const used = await sumOrgCreditsInPeriod(
    organizationId,
    period.start,
    period.end
  );
  const allowance = allowanceForPlan(plan.planTier, plan.allowanceOverride);
  const usedCredits = Math.round(used.credits * 100) / 100;
  const percentUsed =
    allowance > 0 ? Math.min(999, (usedCredits / allowance) * 100) : 0;
  const warn = allowance > 0 && usedCredits / allowance >= AI_USAGE_WARN_RATIO;
  const hardEnforce = isAiUsageHardEnforce();
  const blocked = hardEnforce && usedCredits >= allowance;

  return {
    organizationId,
    organizationName: plan.name,
    planTier: plan.planTier,
    planLabel: AI_PLAN_LABELS[plan.planTier],
    allowance,
    usedCredits,
    remainingCredits: Math.max(0, Math.round((allowance - usedCredits) * 100) / 100),
    percentUsed: Math.round(percentUsed * 10) / 10,
    warn,
    hardEnforce,
    blocked,
    periodLabel: period.label,
    periodStart: period.start.toISOString(),
    periodEnd: period.end.toISOString(),
    callCount: used.callCount,
    inputTokens: used.inputTokens,
    outputTokens: used.outputTokens,
    costUsd: Math.round(used.costUsd * 1e6) / 1e6,
  };
}

export async function listOrgUsageSummaries(limit = 200): Promise<
  OrgAiUsageSummary[]
> {
  const db = await openSql();
  const period = currentUsagePeriod();
  let orgs: RowDataPacket[] = [];
  try {
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT id, name, ai_plan_tier, ai_credit_allowance_override
       FROM organizations
       ORDER BY id ASC
       LIMIT ?`,
      [Math.min(500, Math.max(1, limit))]
    );
    orgs = rows;
  } catch {
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT id, name FROM organizations ORDER BY id ASC LIMIT ?`,
      [Math.min(500, Math.max(1, limit))]
    );
    orgs = rows.map((r) => ({
      ...r,
      ai_plan_tier: 'grassroots',
      ai_credit_allowance_override: null,
    }));
  }

  const summaries: OrgAiUsageSummary[] = [];
  for (const o of orgs) {
    const id = Number(o.id);
    const planTier = isAiPlanTier(o.ai_plan_tier)
      ? o.ai_plan_tier
      : 'grassroots';
    const override =
      o.ai_credit_allowance_override != null
        ? Number(o.ai_credit_allowance_override)
        : null;
    const used = await sumOrgCreditsInPeriod(id, period.start, period.end);
    const allowance = allowanceForPlan(
      planTier,
      Number.isFinite(override as number) ? override : null
    );
    const usedCredits = Math.round(used.credits * 100) / 100;
    const percentUsed =
      allowance > 0 ? Math.min(999, (usedCredits / allowance) * 100) : 0;
    const warn =
      allowance > 0 && usedCredits / allowance >= AI_USAGE_WARN_RATIO;
    const hardEnforce = isAiUsageHardEnforce();
    summaries.push({
      organizationId: id,
      organizationName: o.name != null ? String(o.name) : null,
      planTier,
      planLabel: AI_PLAN_LABELS[planTier],
      allowance,
      usedCredits,
      remainingCredits: Math.max(
        0,
        Math.round((allowance - usedCredits) * 100) / 100
      ),
      percentUsed: Math.round(percentUsed * 10) / 10,
      warn,
      hardEnforce,
      blocked: hardEnforce && usedCredits >= allowance,
      periodLabel: period.label,
      periodStart: period.start.toISOString(),
      periodEnd: period.end.toISOString(),
      callCount: used.callCount,
      inputTokens: used.inputTokens,
      outputTokens: used.outputTokens,
      costUsd: Math.round(used.costUsd * 1e6) / 1e6,
    });
  }

  // Orgs with usage first
  summaries.sort((a, b) => b.usedCredits - a.usedCredits);
  return summaries;
}

export async function setOrgAiPlan(input: {
  organizationId: number;
  planTier: AiPlanTier;
  allowanceOverride?: number | null;
}): Promise<void> {
  const db = await openSql();
  if (input.allowanceOverride === undefined) {
    await db.execute(
      `UPDATE organizations SET ai_plan_tier = ? WHERE id = ?`,
      [input.planTier, input.organizationId]
    );
    return;
  }
  await db.execute(
    `UPDATE organizations
     SET ai_plan_tier = ?,
         ai_credit_allowance_override = ?
     WHERE id = ?`,
    [
      input.planTier,
      input.allowanceOverride != null &&
      Number.isFinite(input.allowanceOverride) &&
      input.allowanceOverride > 0
        ? Math.floor(input.allowanceOverride)
        : null,
      input.organizationId,
    ]
  );
}

export class AiCreditLimitError extends Error {
  status = 402;
  constructor(message: string) {
    super(message);
    this.name = 'AiCreditLimitError';
  }
}

/**
 * Soft/hard gate before an AI call. Throws AiCreditLimitError only when
 * hard-enforce is on and the org is at/over allowance.
 */
export async function assertAiUsageAllowed(
  organizationId: number | null | undefined
): Promise<{ warn: boolean; summary: OrgAiUsageSummary | null }> {
  if (organizationId == null || !(Number(organizationId) > 0)) {
    return { warn: false, summary: null };
  }
  const summary = await getOrgUsageSummary(Number(organizationId));
  if (summary.blocked) {
    throw new AiCreditLimitError(
      `AI credit allowance reached for this period (${summary.usedCredits} / ${summary.allowance} credits on the ${summary.planLabel} plan). Soft metering is normally warn-only; hard enforcement is enabled.`
    );
  }
  return { warn: summary.warn, summary };
}
