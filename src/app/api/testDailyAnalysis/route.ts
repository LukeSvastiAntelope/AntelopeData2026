import { NextRequest } from "next/server";
import { verifyConfirmationToken } from "@/app/utils/api/token";
import { runDailyAnalysisForAgent } from "@/app/utils/api/dailyBetMonitor";

export async function GET(req: NextRequest) {
    const agentId = req.nextUrl.searchParams.get('agentId');

    try {
        // Skip token verification for testing purposes
        console.log('🧪 Running daily analysis test (no auth required)');

        // Validate agentId parameter
        if (!agentId) {
            return Response.json({
                status: false,
                message: 'agentId parameter is required'
            }, { status: 400 });
        }

        console.log(`🚀 Starting test daily analysis for agent ${agentId}`);

        // Run the daily analysis
        const analysisResults = await runDailyAnalysisForAgent(Number(agentId));

        console.log(`✅ Daily analysis completed. Found ${analysisResults.length} results`);

        return Response.json({
            status: true,
            message: `Daily analysis completed for agent ${agentId}`,
            data: {
                agentId: Number(agentId),
                analysisCount: analysisResults.length,
                results: analysisResults,
                summary: {
                    totalBetsAnalyzed: analysisResults.length,
                    positionAdjustmentsRecommended: analysisResults.filter(r => r.shouldAdjustPosition).length,
                    averageConfidenceChange: analysisResults.length > 0 
                        ? (analysisResults.reduce((sum, r) => sum + Math.abs(r.confidenceChange), 0) / analysisResults.length).toFixed(3)
                        : 0,
                    recommendedActions: {
                        increase: analysisResults.filter(r => r.recommendedAction === 'increase').length,
                        decrease: analysisResults.filter(r => r.recommendedAction === 'decrease').length,
                        hold: analysisResults.filter(r => r.recommendedAction === 'hold').length,
                        hedge: analysisResults.filter(r => r.recommendedAction === 'hedge').length,
                    }
                }
            }
        });

    } catch (error) {
        console.error("Error in testDailyAnalysis:", error);
        return Response.json({
            status: false,
            message: error instanceof Error ? error.message : 'Internal server error',
            error: error instanceof Error ? error.stack : 'Unknown error'
        }, { status: 500 });
    }
} 