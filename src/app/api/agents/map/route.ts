import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/app/utils/auth/require-user';
import { ensurePrimaryOrgId } from '@/app/api/dashboard/persons/org';
import {
  AgentSituationService,
  type AgentId,
} from '@/app/utils/services/agent-situation-service';
import { LoopConfigRepo } from '@/app/utils/database/loop-config-repo';
import { ConsultantRepo } from '@/app/utils/database/consultant-repo';
import { getDailyTaskRuntimeStats } from '@/app/utils/scheduler';
import { APPROVAL_TOOLS, AUTO_TOOLS } from '@/app/utils/services/tools/registry';
import {
  AGENT_TOPOLOGY_EDGES,
  AGENT_TOPOLOGY_NODES,
  NEXT_SCHEDULED_HINT,
} from '@/app/utils/services/loop/topology';

export const runtime = 'nodejs';

/**
 * GET /api/agents/map — live status for the fixed H3 topology (read-only).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = requireUserId(request);
    if (typeof auth !== 'string') return auth;
    const userId = Number(auth);
    const orgId = await ensurePrimaryOrgId(userId);
    const uid = Number(userId);

    const loopConfig = await LoopConfigRepo.getOrCreate({
      userId: uid,
      organizationId: orgId,
    });

    const agentIds: AgentId[] = [
      'campaign_consultant',
      'news',
      'campaign_manager',
      'planner',
    ];
    const situations = Object.fromEntries(
      await Promise.all(
        agentIds.map(async (id) => {
          const doc = await AgentSituationService.getCurrent(orgId, id);
          return [id, doc] as const;
        })
      )
    );

    const conversation = await ConsultantRepo.getOrCreateConversation({
      userId: uid,
      organizationId: orgId,
    });
    const pending = await ConsultantRepo.listStagedActions(conversation.id, 'pending');

    const cron = getDailyTaskRuntimeStats();
    const enabled = loopConfig.autonomy !== 'manual';

    const nodes = AGENT_TOPOLOGY_NODES.map((def) => {
      const sitId = def.situationAgentId;
      const doc = sitId ? situations[sitId] : null;
      const snap = doc?.snapshot;
      const lastRun =
        def.role === 'core' || def.id === 'situation'
          ? snap?.loopMeta?.lastProposerAt || snap?.updatedAt || null
          : snap?.updatedAt || null;

      return {
        ...def,
        enabled,
        autonomy: loopConfig.autonomy,
        lastRun,
        nextScheduledRun: enabled ? NEXT_SCHEDULED_HINT : 'Paused (autonomy=manual)',
        version: doc?.version ?? null,
        summary: snap?.summary?.slice(0, 160) || '',
        findingsCount: snap?.findings?.length ?? 0,
        directivesCount: snap?.humanDirectives?.length ?? 0,
        loopMeta: snap?.loopMeta || {},
        pendingGates: def.role === 'human_gate' || def.role === 'core' ? pending.length : 0,
      };
    });

    const consultant = situations.campaign_consultant?.snapshot;

    return NextResponse.json({
      status: true,
      organizationId: orgId,
      topology: {
        readOnly: true,
        note: 'Fixed harness topology — not a workflow authoring canvas.',
        nodes,
        edges: AGENT_TOPOLOGY_EDGES,
      },
      loopConfig,
      cockpit: {
        autonomy: loopConfig.autonomy,
        lastAction: consultant?.loopMeta?.lastAction ?? null,
        lastProposerAt: consultant?.loopMeta?.lastProposerAt ?? null,
        lastTriggers: consultant?.loopMeta?.lastTriggers ?? [],
        lastReasoningTrace: consultant?.loopMeta?.lastReasoningTrace ?? null,
        lastStagedActionId: consultant?.loopMeta?.lastStagedActionId ?? null,
        humanDirectives: consultant?.humanDirectives ?? [],
        nextActions: consultant?.nextActions ?? [],
        summary: consultant?.summary ?? '',
      },
      pendingGates: pending.map((p) => ({
        id: p.id,
        toolName: p.toolName,
        summary: p.summary,
        status: p.status,
        createdAt: p.createdAt,
      })),
      scheduler: {
        lastRunAt: cron.lastRunAt,
        lastRunStatus: cron.lastRunStatus,
        lastRunSummary: cron.lastRunSummary,
        nextScheduledRun: NEXT_SCHEDULED_HINT,
      },
      invariant: {
        title: 'Autonomy never promotes approval tools',
        body: 'The autonomy dial governs only the auto side. Even auto_within_limits cannot promote an approval tool. Full-auto still cannot send — publish, SMS, email, webhooks, charges, and video posts stay behind the human gate. Enforced in the executor, not the prompt.',
        autoToolCount: AUTO_TOOLS.length,
        approvalToolCount: APPROVAL_TOOLS.length,
        approvalTools: APPROVAL_TOOLS,
      },
    });
  } catch (error) {
    console.error('[agents/map GET]', error);
    return NextResponse.json(
      { status: false, message: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}
