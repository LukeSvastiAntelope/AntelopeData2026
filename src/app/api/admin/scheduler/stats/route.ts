import { NextResponse } from 'next/server';
import { UserRepo } from '@/app/utils/database/user-repo';

export async function GET() {
    try {
        // Get total number of agents with active bets
        const agents = await UserRepo.getAgents();
        const totalAgents = agents.length;

        // Get active bets count (simplified for now)
        const activeBets = 0; // Would need to implement proper bet counting

        // For now, using mock data for adjustment stats
        // In production, you'd track these in a separate table
        const stats = {
            totalAgents,
            activeBets: activeBets || 0,
            lastRun: "Never", // Would come from scheduler log table
            nextRun: "2:00 AM EST", // Calculated from cron schedule
            successfulAdjustments: 0, // Would come from adjustment log table
            failedAdjustments: 0 // Would come from adjustment log table
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