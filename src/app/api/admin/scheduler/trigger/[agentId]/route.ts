import { NextResponse } from 'next/server';
import { runDailyAnalysisWithAdjustments } from '@/app/utils/api/dailyBetMonitor';

export async function POST(
    request: Request,
    { params }: { params: Promise<{ agentId: string }> }
) {
    try {
        const resolvedParams = await params;
        const agentId = parseInt(resolvedParams.agentId);
        
        if (isNaN(agentId)) {
            return NextResponse.json({
                success: false,
                message: 'Invalid agent ID'
            }, { status: 400 });
        }

        console.log(`🚀 Manual trigger: Starting daily analysis for agent ${agentId}...`);
        
        const result = await runDailyAnalysisWithAdjustments(agentId);
        
        console.log(`✅ Manual trigger completed for agent ${agentId}`);

        return NextResponse.json({
            success: true,
            message: `Manual analysis completed for agent ${agentId}`,
            agentId,
            analysisCount: result.analysis.length,
            adjustmentCount: result.adjustments.totalAdjustments,
            details: {
                analysis: result.analysis,
                adjustments: result.adjustments
            }
        });
    } catch (error) {
        const resolvedParams = await params;
        console.error(`Failed to trigger manual analysis for agent ${resolvedParams.agentId}:`, error);
        return NextResponse.json({
            success: false,
            message: `Failed to trigger manual analysis for agent ${resolvedParams.agentId}`,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
} 