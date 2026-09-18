/**
 * H2.1 Scheduled proposer — the recursion spine.
 *
 * Reads the merged situation snapshot (findings + feeder agents + human
 * directives), applies loop_config.memory weighting and H2.3 discipline,
 * and stages a recommendation via the existing staged-action pattern.
 * Never deploys or sends anything itself.
 */

import { randomUUID } from 'crypto';
import { openSql } from '@/app/utils/database/db';
import {
  LoopConfigRepo,
  type LoopConfig,
} from '@/app/utils/database/loop-config-repo';
import { ConsultantRepo } from '@/app/utils/database/consultant-repo';
import {
  AgentSituationService,
  type AgentSituationSnapshot,
  type SituationFinding,
} from '@/app/utils/services/agent-situation-service';
import { executeTool } from '@/app/utils/services/tools/executor';
import {
  canRecommendPivot,
  checkFatigueBudget,
  steeringBiasFromDirectives,
  weightFindingsByMemory,
  type LoopRecommendationAction,
  type WeightedFinding,
} from '@/app/utils/services/loop/discipline';
import {
  evaluateLoopTriggers,
  type LoopTriggerName,
  type TriggerHit,
} from '@/app/utils/services/loop/triggers';

export type ProposerPassResult = {
  orgId: number;
  userId: number;
  ran: boolean;
  skippedReason?: string;
  action?: LoopRecommendationAction;
  triggers?: TriggerHit[];
  reasoningTrace?: string;
  stagedActionId?: number | null;
  situationVersion?: number;
};

async function resolveOrgOwnerUserId(orgId: number): Promise<number | null> {
  const db = await openSql();
  const [owners]: any = await db.execute(
    `SELECT user_id FROM organization_members
     WHERE organization_id = ? AND status = 'active' AND role = 'owner'
     ORDER BY accepted_at ASC LIMIT 1`,
    [orgId]
  );
  if (owners?.[0]?.user_id) return Number(owners[0].user_id);

  const [anyMember]: any = await db.execute(
    `SELECT user_id FROM organization_members
     WHERE organization_id = ? AND status = 'active'
     ORDER BY FIELD(role, 'owner', 'admin', 'analyst', 'viewer'), accepted_at ASC
     LIMIT 1`,
    [orgId]
  );
  if (anyMember?.[0]?.user_id) return Number(anyMember[0].user_id);

  const [cfg]: any = await db.execute(
    `SELECT user_id FROM loop_config WHERE organization_id = ? LIMIT 1`,
    [orgId]
  );
  if (cfg?.[0]?.user_id) return Number(cfg[0].user_id);

  return null;
}

async function pickFocusSurveyId(
  orgId: number,
  findings: SituationFinding[]
): Promise<number | null> {
  const fromFinding = findings
    .map((f) => Number(f.sampleProvenance?.surveyId) || 0)
    .find((id) => id > 0);
  if (fromFinding) return fromFinding;

  const db = await openSql();
  const [rows]: any = await db.execute(
    `SELECT s.id
     FROM surveys s
     LEFT JOIN survey_responses sr ON sr.survey_id = s.id
     WHERE s.organization_id = ?
     GROUP BY s.id
     ORDER BY COUNT(sr.id) DESC, s.updated_at DESC
     LIMIT 1`,
    [orgId]
  );
  return rows?.[0]?.id ? Number(rows[0].id) : null;
}

function buildRecommendation(params: {
  weighted: WeightedFinding[];
  fatigueOk: boolean;
  fatigueReason: string;
  pivotGate: { ok: boolean; reason: string };
  steering: { topics: string[]; note: string };
  consultant: AgentSituationSnapshot;
  news: AgentSituationSnapshot;
  research: AgentSituationSnapshot;
  triggers: TriggerHit[];
}): {
  action: LoopRecommendationAction;
  topic: string;
  rationale: string;
  reasoningTrace: string;
} {
  const topConviction = params.weighted.find((f) => f.role === 'conviction');
  const topAny = params.weighted[0];
  const steerTopic = params.steering.topics[0] || '';

  const whatISaw = [
    `Triggers: ${params.triggers.map((t) => t.name).join(', ') || 'none'}.`,
    `Consultant summary: ${params.consultant.summary || '(empty)'}.`,
    `Findings: ${params.weighted.length} weighted (${params.weighted.filter((f) => f.role === 'conviction').length} conviction).`,
    topConviction
      ? `Top conviction: "${topConviction.claim}" (weight=${topConviction.decisionWeight.toFixed(3)}${topConviction.selfConfirmationDownweighted ? ', self-confirmation downweighted' : ''}).`
      : 'No conviction findings available.',
    topAny && topAny.role === 'context'
      ? `Top context (non-actionable alone): "${topAny.claim}".`
      : null,
    params.news.priorityTopics?.length
      ? `News feeder topics: ${params.news.priorityTopics.slice(0, 3).join('; ')}.`
      : 'News feeder quiet.',
    params.research.opportunities?.length
      ? `Research/campaign-manager opportunities: ${params.research.opportunities.slice(0, 2).join('; ')}.`
      : null,
    params.steering.note,
    params.fatigueReason,
    params.pivotGate.reason,
  ]
    .filter(Boolean)
    .join(' ');

  // Default: hold
  let action: LoopRecommendationAction = 'hold';
  let rationale =
    'Insufficient replicated conviction or fatigue/self-confirmation constraints — holding.';

  if (params.steering.topics.length && !topConviction) {
    action = 'iterate';
    rationale = `Honor human directive without over-claiming evidence: focus next cycle on "${steerTopic}".`;
  } else if (topConviction && params.pivotGate.ok && params.fatigueOk) {
    action = 'pivot';
    rationale = `Pivot research direction toward the replicated signal: ${topConviction.claim}`;
  } else if (topConviction && params.fatigueOk) {
    action = 'improved_survey';
    rationale = `Improve the survey to deepen the gated finding (not a full pivot): ${topConviction.claim}`;
  } else if (topConviction && !params.fatigueOk) {
    action = 'iterate';
    rationale = `Fatigue budget blocks a new ask — iterate analysis / messaging on existing survey evidence: ${topConviction.claim}`;
  } else if (params.consultant.openQuestions?.length || params.weighted.some((f) => f.role === 'context')) {
    action = 'hold';
    rationale =
      'Only directional/context signals present — hold and wait for gated conviction or human direction.';
  }

  // Human directive overrides pivot-away: keep iterate/improved on directed topic
  if (steerTopic && action === 'pivot') {
    const claim = (topConviction?.claim || '').toLowerCase();
    if (!claim.includes(steerTopic.toLowerCase().slice(0, 12))) {
      action = 'iterate';
      rationale = `Steering override: stay on human directive "${steerTopic}" rather than pivoting away on new signal.`;
    }
  }

  const topic =
    steerTopic ||
    params.consultant.priorityTopics?.[0] ||
    (topConviction?.claim || '').slice(0, 80) ||
    params.news.priorityTopics?.[0] ||
    'campaign priorities';

  const whyThis = `Recommend **${action}** because: ${rationale}`;
  const reasoningTrace = `what I saw → ${whatISaw}\nwhy this → ${whyThis}`;

  return { action, topic, rationale, reasoningTrace };
}

/**
 * Run one proposer pass for an org. Stages via executeTool (approval tool) —
 * never calls executeApprovedTool / never deploys.
 */
export async function runProposerPass(params: {
  orgId: number;
  userId?: number | null;
  onDemand?: boolean;
  onlyTriggers?: LoopTriggerName[];
  force?: boolean;
}): Promise<ProposerPassResult> {
  const orgId = Number(params.orgId);
  if (!Number.isFinite(orgId) || orgId <= 0) {
    return { orgId, userId: 0, ran: false, skippedReason: 'invalid_org' };
  }

  const userId =
    params.userId && params.userId > 0
      ? Number(params.userId)
      : await resolveOrgOwnerUserId(orgId);
  if (!userId) {
    return { orgId, userId: 0, ran: false, skippedReason: 'no_user' };
  }

  const loopConfig: LoopConfig = await LoopConfigRepo.getOrCreate({
    userId,
    organizationId: orgId,
  });

  if (loopConfig.autonomy === 'manual' && !params.onDemand && !params.force) {
    return {
      orgId,
      userId,
      ran: false,
      skippedReason: 'autonomy_manual',
    };
  }

  const triggerEval = params.force
    ? {
        shouldRun: true,
        hits: [
          {
            name: 'on_demand' as const,
            value: 1,
            threshold: 1,
            detail: 'Forced proposer pass',
          },
        ],
        skipped: [],
      }
    : await evaluateLoopTriggers({
        orgId,
        loopConfig,
        onDemand: params.onDemand,
        only: params.onlyTriggers,
      });

  if (!triggerEval.shouldRun) {
    return {
      orgId,
      userId,
      ran: false,
      skippedReason: 'no_trigger',
      triggers: triggerEval.hits,
    };
  }

  const consultant = await AgentSituationService.getCurrent(
    orgId,
    'campaign_consultant'
  );
  const news = await AgentSituationService.getCurrent(orgId, 'news');
  const research = await AgentSituationService.getCurrent(
    orgId,
    'campaign_manager'
  );

  // Merge feeder signal into the decision view (read-only merge for this pass)
  const mergedFindings = [
    ...(consultant.snapshot.findings || []),
  ];
  const weighted = weightFindingsByMemory(
    mergedFindings,
    loopConfig.memory
  );
  const fatigue = await checkFatigueBudget({
    orgId,
    budgets: loopConfig.budgets,
  });
  const pivotGate = canRecommendPivot(weighted);
  const steering = steeringBiasFromDirectives(
    consultant.snapshot.humanDirectives
  );

  const recommendation = buildRecommendation({
    weighted,
    fatigueOk: fatigue.ok,
    fatigueReason: fatigue.reason,
    pivotGate,
    steering,
    consultant: consultant.snapshot,
    news: news.snapshot,
    research: research.snapshot,
    triggers: triggerEval.hits,
  });

  const surveyId = await pickFocusSurveyId(orgId, mergedFindings);
  const traceId = `loop-propose-${orgId}-${randomUUID().slice(0, 8)}`;

  // Stage via existing executor approval path — proposer never auto-executes
  const toolResult = await executeTool(
    {
      name: 'propose_cycle_action',
      input: {
        action: recommendation.action,
        surveyId: surveyId || undefined,
        topic: recommendation.topic,
        rationale: recommendation.rationale,
        reasoningTrace: recommendation.reasoningTrace,
        triggers: triggerEval.hits.map((h) => h.name),
      },
    },
    { userId, organizationId: orgId }
  );

  let stagedActionId: number | null = null;
  if (toolResult.ok && toolResult.status === 'pending_approval') {
    const conversation = await ConsultantRepo.getOrCreateConversation({
      userId,
      organizationId: orgId,
    });
    const staged = await ConsultantRepo.createStagedAction({
      conversationId: conversation.id,
      toolName: toolResult.tool,
      summary: toolResult.summary,
      payload: {
        tool: toolResult.tool,
        input: toolResult.staged.input,
        description: toolResult.staged.description,
        loop: {
          action: recommendation.action,
          reasoningTrace: recommendation.reasoningTrace,
          triggers: triggerEval.hits,
        },
      },
    });
    stagedActionId = staged.id;

    // Surface in conversation so Auto-Post / consultant cards pick it up
    const messages = [
      ...conversation.messages,
      {
        role: 'assistant' as const,
        content: [
          `### Loop proposer — ${recommendation.action}`,
          recommendation.rationale,
          '',
          '_Staged for your review. Nothing deploys or sends until you Approve._',
        ].join('\n'),
        meta: {
          kind: 'staged_notice' as const,
          toolName: toolResult.tool,
          risk: 'approval' as const,
          stagedActionId: staged.id,
        },
        createdAt: new Date().toISOString(),
      },
    ];
    await ConsultantRepo.saveMessages(conversation.id, userId, messages);
  }

  // Persist reasoning into situation version history (audit + expertise trail)
  const nextActions =
    recommendation.action === 'hold'
      ? [
          `Hold: ${recommendation.rationale}`,
          ...(consultant.snapshot.nextActions || []),
        ]
      : [
          `Proposed ${recommendation.action}: ${recommendation.rationale} (awaiting human approval)`,
          ...(consultant.snapshot.nextActions || []),
        ];

  const doc = await AgentSituationService.commitUpdate({
    orgId,
    agentId: 'campaign_consultant',
    changedByAgent: 'campaign_consultant',
    traceId,
    changeSummary: `H2 proposer: ${recommendation.action} (${triggerEval.hits.map((h) => h.name).join('+') || 'forced'})`,
    patch: {
      summary: [
        consultant.snapshot.summary,
        `Loop proposal: ${recommendation.action} — ${recommendation.rationale}`,
      ]
        .filter(Boolean)
        .join(' ')
        .slice(0, 2000),
      nextActions,
      openQuestions:
        recommendation.action === 'hold'
          ? [
              'Waiting for replicated conviction or human directive before recommending a new ask.',
              ...(consultant.snapshot.openQuestions || []),
            ]
          : consultant.snapshot.openQuestions,
      loopMeta: {
        lastProposerAt: new Date().toISOString(),
        lastAction: recommendation.action,
        lastTriggers: triggerEval.hits.map((h) => h.name),
        lastReasoningTrace: recommendation.reasoningTrace,
        lastStagedActionId: stagedActionId,
      },
      // Embed reasoning in evidenceRefs for quick UI/consultant read
      evidenceRefs: [
        `proposer:${traceId}:${recommendation.action}`,
        ...(consultant.snapshot.evidenceRefs || []),
      ],
    },
  });

  // Full reasoning also lives in version delta via changeSummary + loopMeta
  return {
    orgId,
    userId,
    ran: true,
    action: recommendation.action,
    triggers: triggerEval.hits,
    reasoningTrace: recommendation.reasoningTrace,
    stagedActionId,
    situationVersion: doc.version,
  };
}

export async function listLoopOrgIds(): Promise<number[]> {
  const db = await openSql();
  const ids = new Set<number>();
  const queries = [
    `SELECT DISTINCT org_id AS id FROM agent_situation_documents WHERE org_id > 0`,
    `SELECT DISTINCT organization_id AS id FROM loop_config WHERE organization_id > 0`,
    `SELECT DISTINCT organization_id AS id FROM surveys WHERE organization_id IS NOT NULL AND organization_id > 0`,
    `SELECT id FROM organizations`,
  ];
  for (const sql of queries) {
    try {
      const [rows]: any = await db.execute(sql);
      for (const r of rows || []) {
        const id = Number(r.id);
        if (id > 0) ids.add(id);
      }
    } catch (error) {
      // Table may be absent in partial envs — continue
      console.warn('[loop-proposer] listLoopOrgIds query skipped:', error);
    }
  }
  return Array.from(ids).sort((a, b) => a - b);
}

/**
 * Cron / scheduler entry: evaluate days_elapsed (+ other enabled triggers)
 * for every known org. Never throws past the batch boundary.
 */
export async function runScheduledProposer(params?: {
  onDemand?: boolean;
  onlyTriggers?: LoopTriggerName[];
  orgId?: number;
}): Promise<{
  orgsConsidered: number;
  ran: number;
  skipped: number;
  results: ProposerPassResult[];
}> {
  const orgIds = params?.orgId
    ? [params.orgId]
    : await listLoopOrgIds();
  const results: ProposerPassResult[] = [];
  let ran = 0;
  let skipped = 0;

  for (const orgId of orgIds) {
    try {
      const result = await runProposerPass({
        orgId,
        onDemand: params?.onDemand,
        onlyTriggers: params?.onlyTriggers,
      });
      results.push(result);
      if (result.ran) ran += 1;
      else skipped += 1;
    } catch (error) {
      console.error(`[loop-proposer] org ${orgId} failed:`, error);
      results.push({
        orgId,
        userId: 0,
        ran: false,
        skippedReason:
          error instanceof Error ? error.message : 'proposer_error',
      });
      skipped += 1;
    }
  }

  return { orgsConsidered: orgIds.length, ran, skipped, results };
}

/**
 * Fire-and-forget hook for H1 write-back → response_count trigger.
 * Never throws to analytics callers.
 */
export async function maybeProposeAfterAnalytics(params: {
  orgId: number;
  userId?: number | null;
}): Promise<void> {
  try {
    if (!params.orgId) return;
    await runProposerPass({
      orgId: params.orgId,
      userId: params.userId,
      onlyTriggers: ['response_count'],
    });
  } catch (error) {
    console.warn('[loop-proposer] post-analytics trigger failed (non-fatal):', error);
  }
}
