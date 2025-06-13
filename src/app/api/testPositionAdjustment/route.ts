import { NextRequest } from "next/server";
import { runDailyAnalysisWithAdjustments } from "@/app/utils/api/dailyBetMonitor";

export async function GET(req: NextRequest) {
    const agentId = req.nextUrl.searchParams.get('agentId');
    const executeAdjustments = req.nextUrl.searchParams.get('execute') === 'true';

    try {
        // Skip token verification for testing purposes
        console.log('🧪 Running position adjustment test (no auth required)');

        // Validate agentId parameter
        if (!agentId) {
            return Response.json({
                status: false,
                message: 'agentId parameter is required'
            }, { status: 400 });
        }

        console.log(`🚀 Starting position adjustment test for agent ${agentId} (execute: ${executeAdjustments})`);

        // Run the daily analysis with position adjustments
        const result = await runDailyAnalysisWithAdjustments(Number(agentId));

        console.log(`✅ Position adjustment test completed`);
        console.log(`📊 Analysis: ${result.analysis.length} bets analyzed`);
        console.log(`🔧 Adjustments: ${result.adjustments.totalAdjustments} needed, ${result.adjustments.successful} successful`);

        return Response.json({
            status: true,
            message: `Position adjustment test completed for agent ${agentId}`,
            data: {
                agentId: Number(agentId),
                executeAdjustments,
                analysis: {
                    totalBetsAnalyzed: result.analysis.length,
                    positionAdjustmentsRecommended: result.analysis.filter(r => r.shouldAdjustPosition).length,
                    averageConfidenceChange: result.analysis.length > 0 
                        ? (result.analysis.reduce((sum, r) => sum + Math.abs(r.confidenceChange), 0) / result.analysis.length).toFixed(3)
                        : 0,
                    recommendedActions: {
                        increase: result.analysis.filter(r => r.recommendedAction === 'increase').length,
                        decrease: result.analysis.filter(r => r.recommendedAction === 'decrease').length,
                        hold: result.analysis.filter(r => r.recommendedAction === 'hold').length,
                        hedge: result.analysis.filter(r => r.recommendedAction === 'hedge').length,
                    },
                    results: result.analysis
                },
                adjustments: {
                    totalAdjustments: result.adjustments.totalAdjustments,
                    successful: result.adjustments.successful,
                    failed: result.adjustments.failed,
                    totalAmountBet: result.adjustments.totalAmountBet,
                    details: result.adjustments.adjustmentDetails
                },
                summary: {
                    betsAnalyzed: result.analysis.length,
                    adjustmentsNeeded: result.adjustments.totalAdjustments,
                    adjustmentsExecuted: result.adjustments.successful,
                    totalNewBets: result.adjustments.totalAmountBet,
                    status: result.adjustments.failed > 0 ? 'partial_success' : 
                           result.adjustments.successful > 0 ? 'success' : 'no_adjustments_needed'
                }
            }
        });

    } catch (error) {
        console.error("Error in testPositionAdjustment:", error);
        return Response.json({
            status: false,
            message: error instanceof Error ? error.message : 'Internal server error',
            error: error instanceof Error ? error.stack : 'Unknown error'
        }, { status: 500 });
    }
} 