import { NextResponse } from 'next/server';
import { openSql } from '@/app/utils/database/db';

export async function GET() {
    try {
        const db = await openSql();

        // Get total surveys count
        const [surveyRows]: any = await db.execute('SELECT COUNT(*) as count FROM surveys');
        const totalSurveys = surveyRows[0]?.count || 0;

        // Get active surveys count
        const [activeRows]: any = await db.execute("SELECT COUNT(*) as count FROM surveys WHERE status = 'active'");
        const activeSurveys = activeRows[0]?.count || 0;

        const stats = {
            totalSurveys,
            activeSurveys,
            lastRun: "Never",
            nextRun: "2:00 AM EST",
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
