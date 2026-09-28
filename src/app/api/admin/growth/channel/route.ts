import { NextRequest, NextResponse } from 'next/server';
import {
  requireSuperAdmin,
  clientIp,
} from '@/app/utils/auth/require-super-admin';
import { writeAdminAuditLog } from '@/app/utils/database/admin-audit-repo';
import { getOrCreateGrowthChannel } from '@/app/utils/services/antelope-growth-service';
import { AntelopeGrowthRepo } from '@/app/utils/database/antelope-growth-repo';

/**
 * PATCH /api/admin/growth/channel — update Antelope X channel settings.
 */
export async function PATCH(req: NextRequest) {
  try {
    const gate = await requireSuperAdmin(req);
    if (gate instanceof NextResponse) return gate;

    await getOrCreateGrowthChannel();
    const body = await req.json().catch(() => ({}));
    const channel = await AntelopeGrowthRepo.updateChannelSettings('twitter', {
      handle: body.handle,
      displayName: body.displayName,
      status: body.status,
      settings: body.settings,
    });

    await writeAdminAuditLog({
      actorUserId: gate.numericUserId,
      action: 'growth.channel_update',
      targetType: 'growth_channel',
      targetId: channel?.id ?? null,
      metadata: {
        handle: channel?.handle,
        status: channel?.status,
      },
      ip: clientIp(req),
    });

    return NextResponse.json({ status: true, channel });
  } catch (error) {
    console.error('[admin/growth/channel PATCH]', error);
    return NextResponse.json(
      {
        status: false,
        message: error instanceof Error ? error.message : 'Failed',
      },
      { status: 500 }
    );
  }
}
