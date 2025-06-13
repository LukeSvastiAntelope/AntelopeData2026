import { scheduleDailyTasks } from './scheduler';

// Initialize the scheduler when this module is loaded (server-side only)
let schedulerInitialized = false;

export function initializeScheduler() {
    if (typeof window !== 'undefined') {
        // Don't run on client side
        return;
    }
    
    if (schedulerInitialized) {
        console.log('📅 Scheduler already initialized, skipping...');
        return;
    }
    
    try {
        scheduleDailyTasks();
        schedulerInitialized = true;
        console.log('🚀 Daily bet analysis scheduler initialized successfully');
    } catch (error) {
        console.error('❌ Failed to initialize scheduler:', error);
    }
}

// Auto-initialize when this module is imported (server-side only)
if (typeof window === 'undefined') {
    initializeScheduler();
} 