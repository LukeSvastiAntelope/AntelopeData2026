import { NextRequest, NextResponse } from 'next/server';
import { pollSurveyAutotriggers } from '@/app/utils/services/autotrigger-service';

/**
 * POST /api/cron/autotrigger-poll
 *
 * AT1 backstop: surveys that go quiet then jump still fire once per band.
 * Public like other platform crons — optional CRON_SECRET.
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
