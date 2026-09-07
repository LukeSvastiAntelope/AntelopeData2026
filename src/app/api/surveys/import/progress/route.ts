import { NextRequest, NextResponse } from "next/server";

// In-memory progress tracking (in production, use Redis or database)
const progressStore = new Map<string, {
  status: 'processing' | 'completed' | 'failed';
  progress: number;
  message: string;
  result?: any;
  error?: string;
}>();

export async function GET(req: NextRequest) {
  try {
    const userIdHeader = req.headers.get('x-user-id');
    if (!userIdHeader) {
      return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const progressId = searchParams.get('id');
    
    if (!progressId) {
      return NextResponse.json({ 
        status: false, 
        message: 'Progress ID required' 
      }, { status: 400 });
    }

    const progress = progressStore.get(progressId);
    
    if (!progress) {
      return NextResponse.json({ 
        status: false, 
        message: 'Progress not found' 
      }, { status: 404 });
    }

    return NextResponse.json({ 
      status: true, 
      progress 
    });

  } catch (error) {
    console.error('Error fetching progress:', error);
    return NextResponse.json({ 
      status: false, 
      message: 'Internal server error' 
    }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userIdHeader = req.headers.get('x-user-id');
    if (!userIdHeader) {
      return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
    }

    const { progressId, status, progress, message, result, error } = await req.json();
    
    if (!progressId) {
      return NextResponse.json({ 
        status: false, 
        message: 'Progress ID required' 
      }, { status: 400 });
    }

    progressStore.set(progressId, {
      status,
      progress,
      message,
      result,
      error
    });

    return NextResponse.json({ status: true });

  } catch (error) {
    console.error('Error updating progress:', error);
    return NextResponse.json({ 
      status: false, 
      message: 'Internal server error' 
    }, { status: 500 });
  }
}

// Note: Utility functions moved to separate file to avoid Next.js route export conflicts 