import cron from 'node-cron';
import { UserRepo } from '@/app/utils/database/user-repo';
import { runDailyAnalysisWithAdjustments } from '@/app/utils/api/dailyBetMonitor';

/**
 * Schedule the daily analysis and position adjustment task
 */
export function scheduleDailyTasks() {
    // Schedule to run every day at 2:00 AM (server time)
    cron.schedule('0 2 * * *', async () => {
        console.log('⏰ Running daily analysis and position adjustment task...');
        
        try {
            // Get all active agents
            const activeAgents = await UserRepo.getAgents();
            
            if (!activeAgents || activeAgents.length === 0) {
                console.log('No active agents found. Skipping daily analysis.');
                return;
            }

            console.log(`Found ${activeAgents.length} active agents to process.`);

            // Process each agent individually
            for (const agent of activeAgents) {
                try {
                    console.log(`Processing agent ${agent.id}...`);
                    const result = await runDailyAnalysisWithAdjustments(agent.id);
                    
                    console.log(`Agent ${agent.id} processed successfully.`);
                    console.log(`  Analysis: ${result.analysis.length} bets analyzed`);
                    console.log(`  Adjustments: ${result.adjustments.totalAdjustments} needed, ${result.adjustments.successful} successful`);
                    
                    // Optional: Add delay between agents if needed
                    await new Promise(resolve => setTimeout(resolve, 5000)); // 5-second delay

                } catch (error) {
                    console.error(`Error processing agent ${agent.id}:`, error);
                }
            }
            
            console.log('✅ Daily analysis and position adjustment task completed.');

        } catch (error) {
            console.error('Error in daily analysis cron job:', error);
        }
    }, {
        timezone: "America/New_York"
    });

    console.log('📅 Daily tasks scheduled to run at 2:00 AM (America/New_York)');
}

// Optional: Immediately invoke for testing if this file is run directly
// if (require.main === module) {
//     console.log('Running scheduler directly for testing...');
//     scheduleDailyTasks();
// } 