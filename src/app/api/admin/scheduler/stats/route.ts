import { NextRequest, NextResponse } from 'next/server';
import { openSql } from '@/app/utils/database/db';
import { getDailyTaskRuntimeStats } from '@/app/utils/scheduler';
import {
  requireSuperAdmin,
  clientIp,
} from '@/app/utils/auth/require-super-admin';
import { writeAdminAuditLog } from '@/app/utils/database/admin-audit-repo';

export async function GET(req: NextRequest) {
  try {
    const gate = await requireSuperAdmin(req);
    if (gate instanceof NextResponse) return gate;

    const db = await openSql();

    const [surveyRows]: any = await db.execute(
      'SELECT COUNT(*) as count FROM surveys'
    );
    const totalSurveys = surveyRows[0]?.count || 0;

    const [activeRows]: any = await db.execute(
      "SELECT COUNT(*) as count FROM surveys WHERE status = 'active'"
    );
    const activeSurveys = activeRows[0]?.count || 0;
    const runtime = getDailyTaskRuntimeStats();

    const stats = {
      totalSurveys,
      activeSurveys,
      lastRun: runtime.lastRunAt || 'Never',
      nextRun: '2:00 AM EST',
      lastRunStatus: runtime.lastRunStatus,
      refreshSummary: runtime.lastRunSummary,
      districtRefresh: runtime.lastRunSummary?.csv?.data || null,
      campaignNewsDigest: runtime.lastRunSummary?.campaignNewsDigest || null,
      lastRunError: runtime.lastRunError,
    };

    await writeAdminAuditLog({
      actorUserId: gate.numericUserId,
      action: 'scheduler.stats',
      targetType: 'scheduler',
      ip: clientIp(req),
    });

    return NextResponse.json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error('Failed to get scheduler stats:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Failed to retrieve scheduler statistics',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
