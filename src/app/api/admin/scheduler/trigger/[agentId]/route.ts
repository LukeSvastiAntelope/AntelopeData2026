import { NextResponse } from 'next/server';
import { runScheduledProposer, runProposerPass } from '@/app/utils/services/loop/proposer';
import { AgentSituationService } from '@/app/utils/services/agent-situation-service';

/**
 * POST /api/admin/scheduler/trigger/[agentId]
 *
 * Manual per-agent trigger. H2/H3: loop / campaign_consultant / proposer run
 * the loop proposer. Feeder/executor AgentIds refresh situation reads
 * (event-driven nodes — no separate cron job).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const resolvedParams = await params;
    const raw = String(resolvedParams.agentId || '').trim();
    const body = await request.json().catch(() => ({}));
    const orgId =
      body.orgId != null && Number.isFinite(Number(body.orgId))
        ? Number(body.orgId)
        : undefined;

    const loopAliases = new Set([
      'loop',
      'proposer',
      'campaign_consultant',
      'loop-proposer',
      'analytics',
      'situation',
    ]);

    if (loopAliases.has(raw.toLowerCase())) {
      if (orgId) {
        const result = await runProposerPass({
          orgId,
          onDemand: true,
          force: Boolean(body.force),
        });
        return NextResponse.json({
          success: true,
          message: result.ran
            ? `Proposer ran for org ${orgId}: ${result.action}`
            : `Proposer skipped for org ${orgId}: ${result.skippedReason}`,
          agentId: raw,
          result,
        });
      }

      const summary = await runScheduledProposer({ onDemand: true });
      return NextResponse.json({
        success: true,
        message: `Loop proposer finished: ran=${summary.ran}, skipped=${summary.skipped}`,
        agentId: raw,
        summary,
      });
    }

    const feederAliases = new Set([
      'news',
      'research',
      'planner',
      'campaign_manager',
    ]);
    if (feederAliases.has(raw.toLowerCase())) {
      const situationId =
        raw.toLowerCase() === 'research'
          ? 'news'
          : raw.toLowerCase() === 'campaign_manager'
            ? 'campaign_manager'
            : raw.toLowerCase() === 'planner'
              ? 'planner'
              : 'news';
      if (orgId) {
        const doc = await AgentSituationService.getCurrent(orgId, situationId as any);
        return NextResponse.json({
          success: true,
          message: `${raw} is event-driven (feeder/executor). Situation refreshed — version ${doc.version}, updated ${doc.snapshot.updatedAt}.`,
          agentId: raw,
          situation: {
            agentId: doc.agentId,
            version: doc.version,
            updatedAt: doc.snapshot.updatedAt,
            summary: doc.snapshot.summary,
          },
        });
      }
      return NextResponse.json({
        success: true,
        message: `${raw} is event-driven — pass orgId to refresh its situation snapshot.`,
        agentId: raw,
      });
    }

    const numericId = parseInt(raw, 10);
    if (!Number.isNaN(numericId)) {
      return NextResponse.json({
        success: true,
        message: `No scheduled tasks configured for agent ${numericId}. Use agentId=loop to run the H2 proposer.`,
        agentId: numericId,
      });
    }

    return NextResponse.json(
      {
        success: false,
        message: `Unknown agentId "${raw}". Supported: loop, campaign_consultant, proposer, news, planner, campaign_manager, analytics.`,
      },
      { status: 400 }
    );
  } catch (error) {
    const resolvedParams = await params;
    console.error(`Failed to trigger tasks for agent ${resolvedParams.agentId}:`, error);
    return NextResponse.json(
      {
        success: false,
        message: `Failed to trigger tasks for agent ${resolvedParams.agentId}`,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
