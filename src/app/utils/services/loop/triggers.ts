/**
 * H2.2 Trigger evaluation — governed by loop_config.triggers.
 */

import { openSql } from '@/app/utils/database/db';
import type { LoopConfig, LoopTriggersConfig } from '@/app/utils/database/loop-config-repo';
import {
  AgentSituationService,
  type AgentSituationSnapshot,
} from '@/app/utils/services/agent-situation-service';

export type LoopTriggerName =
  | 'response_count'
  | 'days_elapsed'
  | 'signal_salience'
  | 'on_demand';

export type TriggerHit = {
  name: LoopTriggerName;
  value: number;
  threshold: number;
  detail: string;
};

export type TriggerEvaluation = {
  shouldRun: boolean;
  hits: TriggerHit[];
  skipped: Array<{ name: LoopTriggerName; reason: string }>;
};

async function maxOrgResponseCount(orgId: number): Promise<{
  maxResponses: number;
  surveyId: number | null;
}> {
  const db = await openSql();
  const [rows]: any = await db.execute(
    `SELECT s.id AS survey_id, COUNT(sr.id) AS cnt
     FROM surveys s
     LEFT JOIN survey_responses sr ON sr.survey_id = s.id
     WHERE s.organization_id = ?
     GROUP BY s.id
     ORDER BY cnt DESC
     LIMIT 1`,
    [orgId]
  );
  if (!rows?.[0]) return { maxResponses: 0, surveyId: null };
  return {
    maxResponses: Number(rows[0].cnt || 0),
    surveyId: Number(rows[0].survey_id) || null,
  };
}

function daysSince(iso: string | null | undefined): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
  return (Date.now() - t) / (1000 * 60 * 60 * 24);
}

/**
 * Rough salience score from news + campaign_manager feeder snapshots
 * and consultant opportunities/risks. Threshold is 0–1 style.
 */
function computeSignalSalience(
  consultant: AgentSituationSnapshot,
  news: AgentSituationSnapshot,
  campaignManager: AgentSituationSnapshot
): { score: number; detail: string } {
  const newsSignals =
    (news.opportunities?.length || 0) +
    (news.risks?.length || 0) +
    (news.priorityTopics?.length || 0);
  const cmSignals =
    (campaignManager.opportunities?.length || 0) +
    (campaignManager.risks?.length || 0);
  const consultantHeat =
    (consultant.opportunities?.length || 0) + (consultant.risks?.length || 0);

  // Normalize into ~0–1 with diminishing returns
  const raw = newsSignals * 0.15 + cmSignals * 0.12 + consultantHeat * 0.08;
  const score = Math.min(1, raw);
  return {
    score,
    detail: `salience=${score.toFixed(2)} (newsSignals=${newsSignals}, cm=${cmSignals}, consultantHeat=${consultantHeat})`,
  };
}

export async function evaluateLoopTriggers(params: {
  orgId: number;
  loopConfig: LoopConfig;
  /** Force on_demand (manual / API). */
  onDemand?: boolean;
  /** Only evaluate this trigger set; default = all enabled. */
  only?: LoopTriggerName[];
}): Promise<TriggerEvaluation> {
  const triggers: LoopTriggersConfig = params.loopConfig.triggers;
  const hits: TriggerHit[] = [];
  const skipped: TriggerEvaluation['skipped'] = [];
  const only = params.only ? new Set(params.only) : null;

  const consider = (name: LoopTriggerName) => !only || only.has(name);

  const consultant = await AgentSituationService.getCurrent(
    params.orgId,
    'campaign_consultant'
  );
  const lastAt = consultant.snapshot.loopMeta?.lastProposerAt || null;

  // response_count
  if (consider('response_count')) {
    if (!triggers.response_count?.enabled) {
      skipped.push({ name: 'response_count', reason: 'disabled' });
    } else {
      const { maxResponses, surveyId } = await maxOrgResponseCount(params.orgId);
      const threshold = Number(triggers.response_count.threshold) || 80;
      if (maxResponses >= threshold) {
        hits.push({
          name: 'response_count',
          value: maxResponses,
          threshold,
          detail: `Survey ${surveyId ?? '?'} has ${maxResponses} responses (threshold ${threshold})`,
        });
      } else {
        skipped.push({
          name: 'response_count',
          reason: `${maxResponses} < ${threshold}`,
        });
      }
    }
  }

  // days_elapsed — backed by platform cron, not module timers
  if (consider('days_elapsed')) {
    if (!triggers.days_elapsed?.enabled) {
      skipped.push({ name: 'days_elapsed', reason: 'disabled' });
    } else {
      const threshold = Number(triggers.days_elapsed.threshold) || 7;
      const elapsed = daysSince(lastAt);
      if (elapsed >= threshold) {
        hits.push({
          name: 'days_elapsed',
          value: Number.isFinite(elapsed) ? elapsed : threshold,
          threshold,
          detail: lastAt
            ? `${elapsed.toFixed(1)}d since last proposer pass (threshold ${threshold}d)`
            : `No prior proposer pass — treating as elapsed >= ${threshold}d`,
        });
      } else {
        skipped.push({
          name: 'days_elapsed',
          reason: `${elapsed.toFixed(1)}d < ${threshold}d`,
        });
      }
    }
  }

  // signal_salience
  if (consider('signal_salience')) {
    if (!triggers.signal_salience?.enabled) {
      skipped.push({ name: 'signal_salience', reason: 'disabled' });
    } else {
      const news = await AgentSituationService.getCurrent(params.orgId, 'news');
      const cm = await AgentSituationService.getCurrent(
        params.orgId,
        'campaign_manager'
      );
      const { score, detail } = computeSignalSalience(
        consultant.snapshot,
        news.snapshot,
        cm.snapshot
      );
      const threshold = Number(triggers.signal_salience.threshold) || 0.7;
      if (score >= threshold) {
        hits.push({
          name: 'signal_salience',
          value: score,
          threshold,
          detail,
        });
      } else {
        skipped.push({
          name: 'signal_salience',
          reason: `${score.toFixed(2)} < ${threshold}`,
        });
      }
    }
  }

  // on_demand
  if (consider('on_demand')) {
    if (!triggers.on_demand?.enabled) {
      skipped.push({ name: 'on_demand', reason: 'disabled' });
    } else if (params.onDemand) {
      const threshold = Number(triggers.on_demand.threshold) || 1;
      hits.push({
        name: 'on_demand',
        value: 1,
        threshold,
        detail: 'Explicit on-demand proposer request',
      });
    } else {
      skipped.push({ name: 'on_demand', reason: 'not requested' });
    }
  }

  return {
    shouldRun: hits.length > 0,
    hits,
    skipped,
  };
}
