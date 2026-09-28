import { NextRequest, NextResponse } from 'next/server';
import { runDailyPlatformTasks } from '@/app/utils/scheduler';
import {
  requireSuperAdmin,
  clientIp,
} from '@/app/utils/auth/require-super-admin';
import { writeAdminAuditLog } from '@/app/utils/database/admin-audit-repo';

/**
 * POST /api/admin/scheduler/trigger
 * Manual trigger for daily platform tasks (super-admin only).
 */
export async function POST(req: NextRequest) {
  try {
    const gate = await requireSuperAdmin(req);
    if (gate instanceof NextResponse) return gate;

    console.log('Manual trigger: Running daily platform tasks...');
    const summary = await runDailyPlatformTasks();

    await writeAdminAuditLog({
      actorUserId: gate.numericUserId,
      action: 'scheduler.trigger',
      targetType: 'scheduler',
      metadata: { summary },
      ip: clientIp(req),
    });

    return NextResponse.json({
      success: true,
      message: 'Manual trigger completed.',
      summary,
    });
  } catch (error) {
    console.error('Failed to trigger manual tasks:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Failed to trigger manual tasks',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
