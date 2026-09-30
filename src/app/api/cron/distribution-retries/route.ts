import { NextRequest, NextResponse } from 'next/server';
import { assertCronAuthorized } from '@/app/utils/cron-auth';
import { processDueDeliveries } from '@/app/utils/services/distribution-webhook-service';

/**
 * POST/GET /api/cron/distribution-retries
 * Process due Zapier/Make delivery attempts (backoff 1m / 10m / 1h).
 */
export async function POST(req: NextRequest) {
  try {
    const denied = assertCronAuthorized(req);
    if (denied) return denied;

    const summary = await processDueDeliveries({ limit: 50 });
    console.log('[cron/distribution-retries]', summary);
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    console.error('[cron/distribution-retries]', error);
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : 'Failed',
      },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
