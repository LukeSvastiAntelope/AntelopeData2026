/**
 * AT1.2 / AT2 — Auto-trigger firing + output drafts.
 *
 * Idempotent: atomic claim per response-count band (floor(count/threshold)).
 * On fire: analytics → find_postable_insight → (AT2) newsletter/video drafts
 * with mandatory small-sample disclaimer, staged via consultant_staged_actions.
 */

import { SurveyAutotriggerRepo } from '@/app/utils/database/survey-autotrigger-repo';
import { openSql } from '@/app/utils/database/db';
import { executeTool } from '@/app/utils/services/tools/executor';
import {
  scanPostableInsights,
  type ComputedContrast,
} from '@/app/utils/services/postable-insight-service';
import {
  candidateToFinding,
  contrastToFinding,
  generateAndStageAutotriggerOutputs,
  type FindingDraftSource,
  type StagedDraftResult,
} from '@/app/utils/services/autotrigger-outputs';
import type { RowDataPacket } from 'mysql2';

export type FireAutotriggerOptions = {
  /** Skip LLM analytics/insight chain — claim + emit event only. */
  skipChain?: boolean;
  /** Skip AT2 newsletter/video generation. */
  skipOutputs?: boolean;
  /** Template drafts + mock video URL (smoke). */
  mockOutputs?: boolean;
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
  drafts?: StagedDraftResult[];
  summary?: string;
};

async function resolveSurveyOwner(surveyId: number): Promise<{
  userId: number;
  organizationId: number | null;
  title: string;
} | null> {
  const db = await openSql();
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT created_by, organization_id, title FROM surveys WHERE id = ? LIMIT 1`,
    [surveyId]
  );
  if (!rows[0]) return null;
  return {
    userId: Number(rows[0].created_by),
    organizationId:
      rows[0].organization_id != null ? Number(rows[0].organization_id) : null,
    title: String(rows[0].title || `Survey ${surveyId}`),
  };
}

function pickFindingForOutputs(params: {
  candidates: Record<string, unknown>[];
  directionalOnly: ComputedContrast[];
  totalResponses: number;
}): FindingDraftSource | null {
  if (params.candidates.length) {
    return candidateToFinding(params.candidates[0], params.totalResponses);
  }
  if (params.directionalOnly.length) {
    // Prefer largest cells among directional for a usable thin draft
    const sorted = [...params.directionalOnly].sort(
      (a, b) => Math.min(b.nA, b.nB) - Math.min(a.nA, a.nB)
    );
    return contrastToFinding(sorted[0], params.totalResponses);
  }
  return null;
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
  let drafts: StagedDraftResult[] = [];
  let insightCandidates: Record<string, unknown>[] = [];
  let insightTotal = responseCount;

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

    try {
      const insight = await executeTool(
        { name: 'find_postable_insight', input: { surveyId, maxCandidates: 3 } },
        { userId: owner.userId, organizationId: owner.organizationId }
      );
      insightOk = insight.ok && insight.status === 'executed';
      if (insightOk) summary = insight.summary || summary;
      const data = (insight.data || {}) as Record<string, unknown>;
      if (Array.isArray(data.candidates)) {
        insightCandidates = data.candidates as Record<string, unknown>[];
      }
      if (typeof data.totalResponses === 'number') {
        insightTotal = data.totalResponses;
      }
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

  // AT2: newsletter / video drafts from publishable or thin (directional) finding
  const wantOutputs =
    !options.skipOutputs &&
    (cfg.actions.includes('newsletter') || cfg.actions.includes('video'));

  if (wantOutputs) {
    try {
      let directionalOnly: ComputedContrast[] = [];
      if (!insightCandidates.length) {
        try {
          const scan = await scanPostableInsights({
            surveyId,
            userId: owner.userId,
          });
          directionalOnly = scan.directionalOnly;
          insightTotal = scan.totalResponses;
          // If scan found publishable but tool returned none (e.g. skipChain), use them
          if (!insightCandidates.length && scan.publishable.length) {
            insightCandidates = scan.publishable.map((c) => ({
              claim: contrastToFinding(c, scan.totalResponses).claim,
              honestCaveat: c.uncertaintyNote,
              nA: c.nA,
              nB: c.nB,
              effect: c.absoluteEffect,
              pCorrected: c.pCorrected,
              outcomePrompt: c.outcomePrompt,
              groupA: c.groupA,
              groupB: c.groupB,
              groupingField: c.groupingField,
              contrastId: c.id,
            }));
          }
        } catch (e) {
          console.warn(
            '[autotrigger] scan for AT2 outputs failed (non-fatal):',
            e instanceof Error ? e.message : e
          );
        }
      }

      const finding = pickFindingForOutputs({
        candidates: insightCandidates,
        directionalOnly,
        totalResponses: insightTotal,
      });

      if (finding) {
        const out = await generateAndStageAutotriggerOutputs({
          surveyId,
          surveyTitle: owner.title,
          userId: owner.userId,
          organizationId: owner.organizationId,
          actions: cfg.actions,
          finding,
          options: {
            mockOutputs: options.mockOutputs,
            skipVideoGenerate: options.mockOutputs,
          },
        });
        drafts = out.drafts;
        if (drafts.length) {
          summary = `${summary}\nAT2 staged ${drafts.map((d) => d.kind).join(', ')}`;
        }
      }
    } catch (e) {
      console.error(
        `[autotrigger] AT2 outputs failed survey=${surveyId}:`,
        e instanceof Error ? e.message : e
      );
    }
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
      drafts: drafts.map((d) => ({
        kind: d.kind,
        stagedActionId: d.stagedActionId,
        disclaimerApplied: d.disclaimerApplied,
      })),
      summary: summary.slice(0, 2000),
      firedCount: cfg.firedCount,
    },
  });

  console.log(
    `[autotrigger] fired survey=${surveyId} band=${band} count=${responseCount} event=#${eventId} drafts=${drafts.length} source=${options.source || 'ingest'}`
  );

  return {
    fired: true,
    surveyId,
    responseCount,
    band,
    eventId,
    analyticsOk,
    insightOk,
    drafts,
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
  skipOutputs?: boolean;
  mockOutputs?: boolean;
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
      skipOutputs: params?.skipOutputs,
      mockOutputs: params?.mockOutputs,
    });
    results.push(r);
    if (r.fired) fired++;
    else skipped++;
  }
  return { considered: rows.length, fired, skipped, results };
}
