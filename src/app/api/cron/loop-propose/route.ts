import { NextRequest, NextResponse } from 'next/server';
import { runScheduledProposer } from '@/app/utils/services/loop/proposer';
import { assertCronAuthorized } from '@/app/utils/cron-auth';

/**
 * POST /api/cron/loop-propose
 *
 * Platform cron entry for H2 days_elapsed (and other enabled triggers).
 * Do not rely on in-process node-cron alone under serverless.
 *
 * Optional body: { orgId?: number, onDemand?: boolean }
 * Production requires CRON_SECRET (x-cron-secret or Bearer).
 */
export async function POST(req: NextRequest) {
  try {
    const denied = assertCronAuthorized(req);
    if (denied) return denied;

    const body = await req.json().catch(() => ({}));
    const orgId =
      body.orgId != null && Number.isFinite(Number(body.orgId))
        ? Number(body.orgId)
        : undefined;

    const summary = await runScheduledProposer({
      orgId,
      onDemand: Boolean(body.onDemand),
      // Cron primarily backs days_elapsed; other enabled triggers still evaluate.
    });

    console.log('[cron/loop-propose]', {
      orgs: summary.orgsConsidered,
      ran: summary.ran,
      skipped: summary.skipped,
    });

    return NextResponse.json({
      ok: true,
      ...summary,
      results: summary.results.map((r) => ({
        orgId: r.orgId,
        ran: r.ran,
        action: r.action,
        skippedReason: r.skippedReason,
        stagedActionId: r.stagedActionId,
        triggers: r.triggers?.map((t) => t.name),
      })),
    });
  } catch (error) {
    console.error('[cron/loop-propose] failed:', error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Internal error',
      },
      { status: 500 }
    );
  }
}

/** GET for health / Vercel cron GET probes */
export async function GET(req: NextRequest) {
  return POST(req);
}
