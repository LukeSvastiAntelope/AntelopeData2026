import { NextRequest, NextResponse } from 'next/server';
import { pollSurveyAutotriggers } from '@/app/utils/services/autotrigger-service';
import { assertCronAuthorized } from '@/app/utils/cron-auth';

/**
 * POST /api/cron/autotrigger-poll
 *
 * AT1 backstop: surveys that go quiet then jump still fire once per band.
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
    const skipChain = Boolean(body.skipChain);

    const summary = await pollSurveyAutotriggers({ orgId, skipChain });
    console.log('[cron/autotrigger-poll]', {
      considered: summary.considered,
      fired: summary.fired,
      skipped: summary.skipped,
    });

    return NextResponse.json({
      ok: true,
      considered: summary.considered,
      fired: summary.fired,
      skipped: summary.skipped,
      results: summary.results.map((r) => ({
        surveyId: r.surveyId,
        fired: r.fired,
        skippedReason: r.skippedReason,
        band: r.band,
        responseCount: r.responseCount,
        eventId: r.eventId,
      })),
    });
  } catch (error) {
    console.error('[cron/autotrigger-poll] failed:', error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Internal error',
      },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
