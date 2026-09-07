import { NextResponse } from 'next/server';
import { runDailyPlatformTasks } from '@/app/utils/scheduler';

/**
 * POST /api/admin/scheduler/trigger
 * 
 * Manual trigger for daily platform tasks.
 * The previous prediction/bet analysis logic has been removed.
 * This endpoint can be extended with new political survey tasks.
 */
export async function POST() {
    try {
        console.log('Manual trigger: Running daily platform tasks...');
        const summary = await runDailyPlatformTasks();

        return NextResponse.json({
            success: true,
            message: 'Manual trigger completed.',
            summary,
        });
    } catch (error) {
        console.error('Failed to trigger manual tasks:', error);
        return NextResponse.json({
            success: false,
            message: 'Failed to trigger manual tasks',
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
