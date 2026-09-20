/**
 * AT3 — Autonomy + send governance for survey auto-triggers.
 *
 * propose → drafts stay at the human gate (Auto-Post cards).
 * auto → agent owns the chain within limits + posts a recommendation;
 *        public sends still require executor approval unless full_auto_send.
 * full_auto_send → explicit opt-in to run executeApprovedTool on staged sends.
 *
 * Never silently promotes approval-tier tools. Respects loop_config fatigue budget.
 */

import { openSql } from '@/app/utils/database/db';
import { ConsultantRepo } from '@/app/utils/database/consultant-repo';
import {
  LoopConfigRepo,
  type LoopConfig,
} from '@/app/utils/database/loop-config-repo';
import {
  SurveyAutotriggerRepo,
  type AutotriggerAutonomy,
} from '@/app/utils/database/survey-autotrigger-repo';
import { checkFatigueBudget } from '@/app/utils/services/loop/discipline';
import { executeTool, executeApprovedTool } from '@/app/utils/services/tools/executor';
import type { FindingDraftSource } from '@/app/utils/services/autotrigger-outputs';
import type { StagedDraftResult } from '@/app/utils/services/autotrigger-outputs';
import type { RowDataPacket } from 'mysql2';

export type AutonomyApplyResult = {
  mode: 'propose' | 'auto' | 'auto_capped';
  recommendationStagedId: number | null;
  recommendationAction: string | null;
  recommendationText: string | null;
  sendsExecuted: Array<{ stagedActionId: number; tool: string; ok: boolean; summary: string }>;
  sendsHeldAtGate: number[];
  fatigueOk: boolean;
  fatigueReason: string;
  fullAutoApplied: boolean;
  skippedSendReason?: string;
};

function buildLocalRecommendation(params: {
  finding: FindingDraftSource;
  surveyId: number;
  surveyTitle: string;
  fatigueOk: boolean;
  fatigueReason: string;
}): {
  action: 'improved_survey' | 'iterate' | 'pivot' | 'hold';
  topic: string;
  rationale: string;
  reasoningTrace: string;
} {
  const claim = params.finding.claim.slice(0, 200);
  let action: 'improved_survey' | 'iterate' | 'pivot' | 'hold' = 'hold';
  let rationale = params.fatigueReason;

  if (!params.fatigueOk) {
    action = 'hold';
    rationale = `${params.fatigueReason} Iterate on messaging for "${params.surveyTitle}" instead of a new ask.`;
  } else if (params.finding.flag === 'publishable') {
    action = 'improved_survey';
    rationale = `Deepen the gated finding with a follow-up ask: ${claim}`;
  } else {
    action = 'iterate';
    rationale = `Thin/directional signal only — iterate analysis and messaging, do not over-claim: ${claim}`;
  }

  const topic = (params.finding.groupingField || claim).slice(0, 80);
  const reasoningTrace = [
    `what I saw → Auto-trigger on survey #${params.surveyId} ("${params.surveyTitle}").`,
    `Finding (${params.finding.flag}): ${claim}.`,
    `Cells n=${params.finding.nA}/${params.finding.nB}. ${params.finding.caveat}`,
    params.fatigueReason,
    `why this → Recommend **${action}**: ${rationale}`,
  ].join(' ');

  return { action, topic, rationale, reasoningTrace };
}

/**
 * Effective survey autonomy, capped by org loop_config dial.
 * Org manual → force propose. Survey propose stays propose.
 */
export function resolveEffectiveAutonomy(params: {
  surveyAutonomy: AutotriggerAutonomy;
  loopAutonomy: LoopConfig['autonomy'];
}): 'propose' | 'auto' {
  if (params.loopAutonomy === 'manual') return 'propose';
  return params.surveyAutonomy === 'auto' ? 'auto' : 'propose';
}

async function stageRecommendationCard(params: {
  userId: number;
  organizationId: number | null;
  surveyId: number;
  recommendation: ReturnType<typeof buildLocalRecommendation>;
}): Promise<number | null> {
  const toolResult = await executeTool(
    {
      name: 'propose_cycle_action',
      input: {
        action: params.recommendation.action,
        surveyId: params.surveyId,
        topic: params.recommendation.topic,
        rationale: params.recommendation.rationale,
        reasoningTrace: params.recommendation.reasoningTrace,
        triggers: ['autotrigger'],
      },
    },
    { userId: params.userId, organizationId: params.organizationId }
  );

  if (!(toolResult.ok && toolResult.status === 'pending_approval' && toolResult.staged)) {
    // Still surface as a conversation notice if staging shape unexpected
    return null;
  }

  const conversation = await ConsultantRepo.getOrCreateConversation({
    userId: params.userId,
    organizationId: params.organizationId,
  });
  const staged = await ConsultantRepo.createStagedAction({
    conversationId: conversation.id,
    toolName: 'propose_cycle_action',
    summary: toolResult.summary,
    payload: {
      tool: 'propose_cycle_action',
      input: toolResult.staged.input,
      description: toolResult.staged.description,
      surveyId: params.surveyId,
      kind: 'autotrigger_recommendation',
    },
  });

  const messages = [
    ...conversation.messages,
    {
      role: 'assistant' as const,
      content: [
        '### Auto-trigger recommendation',
        toolResult.summary,
        '',
        '_Endorsement only until you Approve — no new survey deploys from this card alone._',
      ].join('\n'),
      meta: {
        kind: 'staged_notice' as const,
        toolName: 'propose_cycle_action',
        risk: 'approval' as const,
        stagedActionId: staged.id,
      },
      createdAt: new Date().toISOString(),
    },
  ];
  await ConsultantRepo.saveMessages(conversation.id, params.userId, messages);
  return staged.id;
}

/**
 * Apply AT3 autonomy after AT2 drafts exist.
 */
export async function applyAutotriggerAutonomy(params: {
  surveyId: number;
  surveyTitle: string;
  userId: number;
  organizationId?: number | null;
  surveyAutonomy: AutotriggerAutonomy;
  fullAutoSend: boolean;
  finding: FindingDraftSource;
  drafts: StagedDraftResult[];
  /** Smoke: do not call executeApprovedTool. */
  dryRun?: boolean;
}): Promise<AutonomyApplyResult> {
  const orgId = params.organizationId != null ? Number(params.organizationId) : null;

  const loopConfig = await LoopConfigRepo.getOrCreate({
    userId: params.userId,
    organizationId: orgId && orgId > 0 ? orgId : 0,
  });

  const effective = resolveEffectiveAutonomy({
    surveyAutonomy: params.surveyAutonomy,
    loopAutonomy: loopConfig.autonomy,
  });

  const fatigue =
    orgId && orgId > 0
      ? await checkFatigueBudget({ orgId, budgets: loopConfig.budgets })
      : {
          ok: true,
          surveysInWindow: 0,
          maxAllowed: loopConfig.budgets.maxSurveysPerListPerWindow,
          windowDays: loopConfig.budgets.windowDays,
          reason: 'No organization — fatigue budget not applied.',
        };

  // Also count recent autotrigger fires (spam discipline for auto-owned surveys)
  let fireSpamOk = true;
  let fireSpamReason = '';
  if (orgId && orgId > 0) {
    const fires = await SurveyAutotriggerRepo.countOrgFiresInWindow(
      orgId,
      loopConfig.budgets.windowDays
    );
    // Current fire already counted in events if emitted before this call —
    // allow up to maxAllowed fires in window (same ceiling as survey asks).
    const max = Math.max(1, loopConfig.budgets.maxSurveysPerListPerWindow);
    fireSpamOk = fires <= max;
    fireSpamReason = fireSpamOk
      ? `Auto-trigger fire budget OK: ${fires}/${max} in ${loopConfig.budgets.windowDays}d.`
      : `Auto-trigger fire budget exceeded: ${fires}/${max} in ${loopConfig.budgets.windowDays}d — holding public auto-send.`;
  }

  const recommendation = buildLocalRecommendation({
    finding: params.finding,
    surveyId: params.surveyId,
    surveyTitle: params.surveyTitle,
    fatigueOk: fatigue.ok,
    fatigueReason: fatigue.reason,
  });

  let recommendationStagedId: number | null = null;
  try {
    recommendationStagedId = await stageRecommendationCard({
      userId: params.userId,
      organizationId: orgId,
      surveyId: params.surveyId,
      recommendation,
    });
  } catch (e) {
    console.warn(
      '[AT3] recommendation stage failed (non-fatal):',
      e instanceof Error ? e.message : e
    );
  }

  const sendsHeldAtGate = params.drafts.map((d) => d.stagedActionId);
  const sendsExecuted: AutonomyApplyResult['sendsExecuted'] = [];

  // propose → stop at gate
  if (effective === 'propose') {
    return {
      mode: 'propose',
      recommendationStagedId,
      recommendationAction: recommendation.action,
      recommendationText: recommendation.rationale,
      sendsExecuted: [],
      sendsHeldAtGate,
      fatigueOk: fatigue.ok,
      fatigueReason: fatigue.reason,
      fullAutoApplied: false,
    };
  }

  // auto without full_auto_send → own the chain, leave public sends gated
  const allowFullAuto =
    params.fullAutoSend && fireSpamOk && !params.dryRun;

  if (!params.fullAutoSend || params.dryRun || !fireSpamOk) {
    const conversation = await ConsultantRepo.getOrCreateConversation({
      userId: params.userId,
      organizationId: orgId,
    });
    const note = [
      '### Auto-trigger — agent-owned chain (within limits)',
      `Survey #${params.surveyId}: drafts staged; public send remains at the human gate.`,
      params.fullAutoSend && !fireSpamOk
        ? fireSpamReason
        : 'full_auto_send is off — executor will not promote approval-tier sends.',
      `Recommendation: **${recommendation.action}** — ${recommendation.rationale}`,
      '',
      '_Approve the cards when ready. Auto never silently promotes a gated send._',
    ].join('\n');
    await ConsultantRepo.saveMessages(conversation.id, params.userId, [
      ...conversation.messages,
      {
        role: 'assistant',
        content: note,
        meta: { kind: 'text', toolName: 'autotrigger_autonomy' },
        createdAt: new Date().toISOString(),
      },
    ]);

    return {
      mode: params.fullAutoSend && !fireSpamOk ? 'auto_capped' : 'auto',
      recommendationStagedId,
      recommendationAction: recommendation.action,
      recommendationText: recommendation.rationale,
      sendsExecuted: [],
      sendsHeldAtGate,
      fatigueOk: fatigue.ok,
      fatigueReason: fatigue.reason,
      fullAutoApplied: false,
      skippedSendReason: !params.fullAutoSend
        ? 'full_auto_send_off'
        : !fireSpamOk
          ? 'fire_budget'
          : params.dryRun
            ? 'dry_run'
            : undefined,
    };
  }

  // full_auto_send opted in — run executeApprovedTool only for tools that exist
  for (const draft of params.drafts) {
    const staged = await ConsultantRepo.getStagedActionById(draft.stagedActionId);
    if (!staged || staged.status !== 'pending') continue;

    const toolName = String(
      (staged.payload as any).tool || staged.toolName || ''
    );
    // Only approval-tier tools the registry knows; draft_newsletter is not executable send
    if (toolName === 'draft_newsletter') {
      sendsHeldAtGate.push(draft.stagedActionId);
      continue;
    }
    if (toolName !== 'generate_and_post_video' && toolName !== 'send_email') {
      continue;
    }

    const input = ((staged.payload as any).input || {}) as Record<string, unknown>;
    try {
      const execution = await executeApprovedTool(
        { name: toolName, input },
        { userId: params.userId, organizationId: orgId }
      );
      const ok = Boolean(execution.ok && execution.status === 'executed');
      await ConsultantRepo.updateStagedAction(staged.id, {
        status: ok ? 'executed' : 'approved',
        resultSummary: execution.summary,
        resultData:
          execution.ok && 'data' in execution ? execution.data || null : null,
      });
      sendsExecuted.push({
        stagedActionId: staged.id,
        tool: toolName,
        ok,
        summary: execution.summary.slice(0, 500),
      });
    } catch (e) {
      sendsExecuted.push({
        stagedActionId: staged.id,
        tool: toolName,
        ok: false,
        summary: e instanceof Error ? e.message : 'execute_failed',
      });
    }
  }

  return {
    mode: 'auto',
    recommendationStagedId,
    recommendationAction: recommendation.action,
    recommendationText: recommendation.rationale,
    sendsExecuted,
    sendsHeldAtGate: params.drafts
      .map((d) => d.stagedActionId)
      .filter((id) => !sendsExecuted.some((s) => s.stagedActionId === id && s.ok)),
    fatigueOk: fatigue.ok,
    fatigueReason: fatigue.reason,
    fullAutoApplied: true,
  };
}

/** Resolve survey title for callers that only have an id. */
export async function loadSurveyTitle(surveyId: number): Promise<string> {
  const db = await openSql();
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT title FROM surveys WHERE id = ? LIMIT 1`,
    [surveyId]
  );
  return String(rows[0]?.title || `Survey ${surveyId}`);
}
