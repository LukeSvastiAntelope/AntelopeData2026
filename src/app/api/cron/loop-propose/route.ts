import { NextRequest, NextResponse } from 'next/server';
import { runScheduledProposer } from '@/app/utils/services/loop/proposer';

/**
 * POST /api/cron/loop-propose
 *
 * Platform cron entry for H2 days_elapsed (and other enabled triggers).
 * Public like /api/surveys/cron/close-expired — do not rely on in-process
 * node-cron alone under serverless.
 *
 * Optional body: { orgId?: number, onDemand?: boolean }
 * Optional header: x-cron-secret matching CRON_SECRET when set.
 */
export async function POST(req: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET;
    if (secret) {
      const provided =
        req.headers.get('x-cron-secret') ||
        req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
      if (provided !== secret) {
        return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
      }
    }

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
