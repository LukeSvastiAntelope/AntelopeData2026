import { NextRequest, NextResponse } from 'next/server';
import { pollVolunteerShiftReminders } from '@/app/utils/services/volunteer-reminder-service';

/**
 * POST/GET /api/cron/volunteer-reminders
 * Stages pre-shift reminders + post-shift check-in prompts via gated outbound.
 * Nothing sends until staff approve on Outbound.
 */
export async function POST(req: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET;
    if (process.env.NODE_ENV === 'production') {
      if (!secret) {
        return NextResponse.json(
          { ok: false, error: 'CRON_SECRET not configured' },
          { status: 500 }
        );
      }
      const provided =
        req.headers.get('x-cron-secret') ||
        req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
      if (provided !== secret) {
        return NextResponse.json(
          { ok: false, error: 'Unauthorized' },
          { status: 401 }
        );
      }
    } else if (secret) {
      const provided =
        req.headers.get('x-cron-secret') ||
        req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
      if (provided !== secret) {
        return NextResponse.json(
          { ok: false, error: 'Unauthorized' },
          { status: 401 }
        );
      }
    }

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
