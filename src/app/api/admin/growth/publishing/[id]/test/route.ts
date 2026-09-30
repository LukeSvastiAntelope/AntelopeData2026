import { NextRequest, NextResponse } from 'next/server';
import {
  requireSuperAdmin,
  clientIp,
} from '@/app/utils/auth/require-super-admin';
import { writeAdminAuditLog } from '@/app/utils/database/admin-audit-repo';
import { sendTestPlatformWebhook } from '@/app/utils/services/platform-distribution-service';

export const runtime = 'nodejs';
export const maxDuration = 30;

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/growth/publishing/[id]/test
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const gate = await requireSuperAdmin(req);
    if (gate instanceof NextResponse) return gate;

    const { id: idRaw } = await ctx.params;
    const id = Number(idRaw);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json(
        { status: false, message: 'Invalid id' },
        { status: 400 }
      );
    }

    const result = await sendTestPlatformWebhook(id);

    await writeAdminAuditLog({
      actorUserId: gate.numericUserId,
      action: 'growth.publishing_test',
      targetType: 'platform_webhook',
      targetId: id,
      metadata: { ok: result.ok, statusCode: result.statusCode || null },
      ip: clientIp(req),
    });

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
    console.error('[admin/growth/publishing test]', err);
    const clientError =
      /not found|https|Invalid|not allowed|private|credentials/i.test(message);
    return NextResponse.json(
      { status: false, message },
      { status: clientError ? 400 : 500 }
    );
  }
}
