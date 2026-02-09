import cron from 'node-cron';

/**
 * Schedule daily platform tasks.
 * 
 * The previous prediction/bet analysis tasks have been removed.
 * This scheduler can be extended with new political survey tasks
 * (e.g., closing expired surveys, sending reminders, etc.)
 */
export function scheduleDailyTasks() {
    // Schedule to run every day at 2:00 AM (server time)
    cron.schedule('0 2 * * *', async () => {
        console.log('⏰ Running daily platform tasks...');
        
        try {
            // Future: Add survey lifecycle tasks here
            // e.g., close expired surveys, send tracking poll reminders, etc.
            console.log('✅ Daily platform tasks completed.');
        } catch (error) {
            console.error('Error in daily cron job:', error);
        }
    }, {
        timezone: "America/New_York"
    });

    console.log('📅 Daily tasks scheduled to run at 2:00 AM (America/New_York)');
}
