import { NextRequest, NextResponse } from 'next/server';
import { assertCronAuthorized } from '@/app/utils/cron-auth';
import { processDueDeliveries } from '@/app/utils/services/distribution-webhook-service';
import { processDuePlatformDeliveries } from '@/app/utils/services/platform-distribution-service';

/**
 * POST/GET /api/cron/distribution-retries
 * Process due Zapier/Make delivery attempts (campaign + platform).
 */
export async function POST(req: NextRequest) {
  try {
    const denied = assertCronAuthorized(req);
    if (denied) return denied;

    const campaign = await processDueDeliveries({ limit: 50 });
    const platform = await processDuePlatformDeliveries({ limit: 50 });
    const summary = {
      campaign,
      platform,
      processed: campaign.processed + platform.processed,
      succeeded: campaign.succeeded + platform.succeeded,
      failed: campaign.failed + platform.failed,
    };
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
