/**
 * AT1.2 — Auto-trigger firing: threshold crossing → analytics → find_postable_insight.
 *
 * Idempotent: atomic claim per response-count band (floor(count/threshold)).
 * Never re-fires on every new response. Scheduler poll is a backstop for quiet→jump.
 */

import { SurveyAutotriggerRepo } from '@/app/utils/database/survey-autotrigger-repo';
import { openSql } from '@/app/utils/database/db';
import { executeTool } from '@/app/utils/services/tools/executor';
import type { RowDataPacket } from 'mysql2';

export type FireAutotriggerOptions = {
  /** Skip LLM chain — claim + emit event only (smoke / dry-run). */
  skipChain?: boolean;
  /** Source tag for the event result payload. */
  source?: 'ingest' | 'scheduler' | 'manual' | 'smoke';
};

export type FireAutotriggerResult = {
  fired: boolean;
  skippedReason?: string;
  surveyId: number;
  responseCount?: number;
  band?: number;
  eventId?: number;
  analyticsOk?: boolean;
  insightOk?: boolean;
  summary?: string;
};

async function resolveSurveyOwner(surveyId: number): Promise<{
  userId: number;
  organizationId: number | null;
} | null> {
  const db = await openSql();
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT created_by, organization_id FROM surveys WHERE id = ? LIMIT 1`,
    [surveyId]
  );
  if (!rows[0]) return null;
  return {
    userId: Number(rows[0].created_by),
    organizationId:
      rows[0].organization_id != null ? Number(rows[0].organization_id) : null,
  };
}

/**
 * Evaluate + maybe fire for one survey. Safe to call after every ingest.
 */
export async function maybeFireSurveyAutotrigger(
  surveyId: number,
  options: FireAutotriggerOptions = {}
): Promise<FireAutotriggerResult> {
  const config = await SurveyAutotriggerRepo.getBySurveyId(surveyId);
  if (!config || !config.enabled) {
    return { fired: false, skippedReason: 'disabled_or_missing', surveyId };
  }

  const responseCount = await SurveyAutotriggerRepo.countResponses(surveyId);
  if (responseCount < config.threshold) {
    return {
      fired: false,
      skippedReason: 'below_threshold',
      surveyId,
      responseCount,
    };
  }

  const claimed = await SurveyAutotriggerRepo.tryClaimFire(surveyId, responseCount);
  if (!claimed) {
    return {
      fired: false,
      skippedReason: 'already_fired_this_band',
      surveyId,
      responseCount,
    };
  }

  const owner = await resolveSurveyOwner(surveyId);
  if (!owner) {
    return { fired: false, skippedReason: 'survey_not_found', surveyId };
  }

  const { config: cfg, band } = claimed;
  let analyticsOk = false;
  let insightOk = false;
  let summary = 'claimed';

  if (!options.skipChain) {
    try {
      const analytics = await executeTool(
        { name: 'run_analytics', input: { surveyId } },
        { userId: owner.userId, organizationId: owner.organizationId }
      );
      analyticsOk = analytics.ok && analytics.status === 'executed';
      summary = analytics.summary || summary;
    } catch (e) {
      summary = e instanceof Error ? e.message : 'analytics_failed';
    }

    // Always attempt postable-insight after analytics (AT1 chain), even if analytics soft-failed
    try {
      const insight = await executeTool(
        { name: 'find_postable_insight', input: { surveyId, maxCandidates: 3 } },
        { userId: owner.userId, organizationId: owner.organizationId }
      );
      insightOk = insight.ok && insight.status === 'executed';
      if (insightOk) summary = insight.summary || summary;
    } catch (e) {
      if (!analyticsOk) {
        summary = e instanceof Error ? e.message : 'insight_failed';
      }
    }
  } else {
    summary = 'skip_chain';
    analyticsOk = true;
    insightOk = true;
  }

  const eventId = await SurveyAutotriggerRepo.emitEvent({
    surveyId,
    organizationId: owner.organizationId,
    eventType: 'autotrigger.fired',
    responseCount,
    threshold: cfg.threshold,
    band,
    actions: cfg.actions,
    autonomy: cfg.autonomy,
    result: {
      source: options.source || 'ingest',
      analyticsOk,
      insightOk,
      skipChain: Boolean(options.skipChain),
      summary: summary.slice(0, 2000),
      firedCount: cfg.firedCount,
    },
  });

  console.log(
    `[autotrigger] fired survey=${surveyId} band=${band} count=${responseCount} event=#${eventId} source=${options.source || 'ingest'}`
  );

  return {
    fired: true,
    surveyId,
    responseCount,
    band,
    eventId,
    analyticsOk,
    insightOk,
    summary,
  };
}

/** Fire-and-forget wrapper for ingest paths — never throws to caller. */
export function scheduleAutotriggerCheck(
  surveyId: number,
  source: FireAutotriggerOptions['source'] = 'ingest'
): void {
  void maybeFireSurveyAutotrigger(surveyId, { source }).catch((e) => {
    console.error(
      `[autotrigger] ingest check failed survey=${surveyId}:`,
      e instanceof Error ? e.message : e
    );
  });
}

/**
 * Scheduler backstop: scan enabled autotriggers whose response count
 * has crossed a new band (quiet survey then jump, or missed ingest hook).
 */
export async function pollSurveyAutotriggers(params?: {
  orgId?: number;
  skipChain?: boolean;
}): Promise<{
  considered: number;
  fired: number;
  skipped: number;
  results: FireAutotriggerResult[];
}> {
  const rows = await SurveyAutotriggerRepo.listEnabled(params?.orgId);
  const results: FireAutotriggerResult[] = [];
  let fired = 0;
  let skipped = 0;
  for (const row of rows) {
    const r = await maybeFireSurveyAutotrigger(row.surveyId, {
      source: 'scheduler',
      skipChain: params?.skipChain,
    });
    results.push(r);
    if (r.fired) fired++;
    else skipped++;
  }
  return { considered: rows.length, fired, skipped, results };
}
