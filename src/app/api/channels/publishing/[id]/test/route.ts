import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/app/utils/auth/require-user';
import { ensurePrimaryOrgId } from '@/app/api/dashboard/persons/org';
import { sendTestDistributionWebhook } from '@/app/utils/services/distribution-webhook-service';

export const runtime = 'nodejs';
export const maxDuration = 30;

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/channels/publishing/[id]/test — fire a sample payload to the Catch Hook.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = requireUserId(req);
  if (typeof auth !== 'string') return auth;

  try {
    const { id: idRaw } = await ctx.params;
    const id = Number(idRaw);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json(
        { status: false, message: 'Invalid id' },
        { status: 400 }
      );
    }

    const organizationId = await ensurePrimaryOrgId(auth);
    const result = await sendTestDistributionWebhook(organizationId, id);

    if (!result.ok) {
      return NextResponse.json(
        {
          status: false,
          message: result.error || 'Delivery failed',
          delivery: result,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      status: true,
      message: 'Test payload sent — check Zapier/Make for the sample.',
      delivery: result,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to send test webhook';
    console.error('[publishing] test error', err);
    const clientError =
      /not found|https|Invalid|not allowed|private|credentials/i.test(message);
    return NextResponse.json(
      { status: false, message },
      { status: clientError ? 400 : 500 }
    );
  }
}
