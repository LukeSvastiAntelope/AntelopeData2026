import { NextResponse } from 'next/server';
import { openSql } from '@/app/utils/database/db';
import { getDailyTaskRuntimeStats } from '@/app/utils/scheduler';

export async function GET() {
    try {
        const db = await openSql();

        // Get total surveys count
        const [surveyRows]: any = await db.execute('SELECT COUNT(*) as count FROM surveys');
        const totalSurveys = surveyRows[0]?.count || 0;

        // Get active surveys count
        const [activeRows]: any = await db.execute("SELECT COUNT(*) as count FROM surveys WHERE status = 'active'");
        const activeSurveys = activeRows[0]?.count || 0;
        const runtime = getDailyTaskRuntimeStats();

        const stats = {
            totalSurveys,
            activeSurveys,
            lastRun: runtime.lastRunAt || "Never",
            nextRun: "2:00 AM EST",
            lastRunStatus: runtime.lastRunStatus,
            refreshSummary: runtime.lastRunSummary,
            districtRefresh: runtime.lastRunSummary?.csv?.data || null,
            campaignNewsDigest: runtime.lastRunSummary?.campaignNewsDigest || null,
            lastRunError: runtime.lastRunError,
        };

        return NextResponse.json({
            success: true,
            stats
        });
    } catch (error) {
        console.error('Failed to get scheduler stats:', error);
        return NextResponse.json({
            success: false,
            message: 'Failed to retrieve scheduler statistics',
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
