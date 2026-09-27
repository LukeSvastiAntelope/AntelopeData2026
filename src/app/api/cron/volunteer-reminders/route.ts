import { NextRequest, NextResponse } from 'next/server';
import { pollVolunteerShiftReminders } from '@/app/utils/services/volunteer-reminder-service';
import { assertCronAuthorized } from '@/app/utils/cron-auth';

/**
 * POST/GET /api/cron/volunteer-reminders
 * Stages pre-shift reminders + post-shift check-in prompts via gated outbound.
 * Nothing sends until staff approve on Outbound.
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

    const summary = await pollVolunteerShiftReminders({
      organizationId: orgId,
    });
    console.log('[cron/volunteer-reminders]', summary);

    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    console.error('[cron/volunteer-reminders] failed:', error);
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
