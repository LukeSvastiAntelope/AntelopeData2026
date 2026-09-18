import { NextResponse } from 'next/server';
import { runScheduledProposer, runProposerPass } from '@/app/utils/services/loop/proposer';

/**
 * POST /api/admin/scheduler/trigger/[agentId]
 *
 * Manual per-agent trigger. H2: `loop` / `campaign_consultant` / `proposer`
 * run the loop proposer (on_demand). Numeric ids remain a no-op stub for
 * legacy clients.
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
                message: `Unknown agentId "${raw}". Supported: loop, campaign_consultant, proposer.`,
            },
            { status: 400 }
        );
    } catch (error) {
        const resolvedParams = await params;
        console.error(`Failed to trigger tasks for agent ${resolvedParams.agentId}:`, error);
        return NextResponse.json({
            success: false,
            message: `Failed to trigger tasks for agent ${resolvedParams.agentId}`,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
