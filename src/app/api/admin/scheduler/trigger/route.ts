import { NextResponse } from 'next/server';
import { runDailyAnalysisWithAdjustments } from '@/app/utils/api/dailyBetMonitor';
import { UserRepo } from '@/app/utils/database/user-repo';

export async function POST() {
    try {
        console.log('🚀 Manual trigger: Starting daily analysis for all agents...');
        
        // Get all agents
        const agents = await UserRepo.getAgents();
        console.log(`📊 Found ${agents.length} agents to process`);

        const results = [];
        let successCount = 0;
        let errorCount = 0;

        // Process each agent
        for (const agent of agents) {
            try {
                console.log(`🔍 Processing agent ${agent.id}...`);
                
                const result = await runDailyAnalysisWithAdjustments(agent.id);
                results.push({
                    agentId: agent.id,
                    success: true,
                    analysisCount: result.analysis.length,
                    adjustmentCount: result.adjustments.totalAdjustments,
                    message: `Analyzed ${result.analysis.length} bets, made ${result.adjustments.totalAdjustments} adjustments`
                });
                
                successCount++;
                
                // Add delay between agents to prevent overload
                await new Promise(resolve => setTimeout(resolve, 2000));
            } catch (error) {
                console.error(`Error processing agent ${agent.id}:`, error);
                results.push({
                    agentId: agent.id,
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
                errorCount++;
            }
        }

        console.log(`✅ Manual trigger completed: ${successCount} successful, ${errorCount} errors`);

        return NextResponse.json({
            success: true,
            message: `Manual analysis completed for ${agents.length} agents`,
            summary: {
                totalAgents: agents.length,
                successful: successCount,
                errors: errorCount
            },
            results
        });
    } catch (error) {
        console.error('Failed to trigger manual analysis:', error);
        return NextResponse.json({
            success: false,
            message: 'Failed to trigger manual analysis',
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
} 