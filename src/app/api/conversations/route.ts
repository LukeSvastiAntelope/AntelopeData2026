import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';

interface Conversation {
  id: string;
  title: string;
  messages: any[];
  createdAt: string;
  updatedAt: string;
  surveyId?: number | null;
  cohortId?: number | null;
  userId: string;
}

// GET - Load conversations for user
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    
    // For now, we'll use localStorage-based persistence
    // In production, you'd load from database
    const conversations: Conversation[] = [];
    
    return NextResponse.json({ 
      status: true, 
      conversations: conversations.sort((a, b) => 
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )
    });
  } catch (error) {
    console.error('Error loading conversations:', error);
    return NextResponse.json({ error: 'Failed to load conversations' }, { status: 500 });
  }
}

// POST - Save conversation
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const body = await request.json();
    const { id, title, messages, surveyId, cohortId } = body;

    if (!id || !title) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const conversation: Conversation = {
      id,
      title,
      messages: messages || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      surveyId,
      cohortId,
      userId
    };

    // For now, we'll return success
    // In production, you'd save to database
    
    return NextResponse.json({ 
      status: true, 
      conversation 
    });
  } catch (error) {
    console.error('Error saving conversation:', error);
    return NextResponse.json({ error: 'Failed to save conversation' }, { status: 500 });
  }
} 