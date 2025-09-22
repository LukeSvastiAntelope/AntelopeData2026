import { scheduleDailyTasks } from './scheduler';

// Initialize the scheduler when this module is loaded (server-side only)
let schedulerInitialized = false;

export function initializeScheduler() {
    if (typeof window !== 'undefined') {
        // Don't run on client side
        return;
    }
    // Only run in production server environment
    if (process.env.NODE_ENV !== 'production') {
        console.log('📅 Scheduler disabled in non-production environment');
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

// Auto-initialize only in production server
if (typeof window === 'undefined' && process.env.NODE_ENV === 'production') {
    initializeScheduler();
}