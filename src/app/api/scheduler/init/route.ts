import { initializeScheduler } from '@/app/utils/schedulerInit';
import { NextResponse } from 'next/server';

export async function POST() {
    try {
        initializeScheduler();
        return NextResponse.json({ 
            success: true, 
            message: 'Daily bet analysis scheduler initialized successfully' 
        });
    } catch (error) {
        console.error('Failed to initialize scheduler:', error);
        return NextResponse.json({ 
            success: false, 
            message: 'Failed to initialize scheduler',
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}

export async function GET() {
    return NextResponse.json({ 
        message: 'Scheduler initialization endpoint. Use POST to initialize.' 
    });
} 