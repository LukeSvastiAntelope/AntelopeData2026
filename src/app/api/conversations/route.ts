import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { openSql as getMySQLConnection } from '@/app/utils/database/db';
import { RowDataPacket } from 'mysql2/promise';

interface Conversation {
  id: string;
  title: string;
  messages: any[];
  createdAt: string;
  updatedAt: string;
  surveyId?: number | null;
  cohortId?: number | null;
  type?: 'chat' | 'news' | 'code';
  userId: string;
}

function logConversation(trace: string, stage: string, details: Record<string, unknown>) {
  console.log(JSON.stringify({ scope: 'conversations', trace, stage, ...details }));
}

// GET - Load conversations for user
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id; // Keep as string, MySQL driver handles conversion
    const db = await getMySQLConnection();
    
    // First get conversation metadata without the large messages column to avoid sort memory issues
    const [metadataRows] = await db.execute<RowDataPacket[]>(
      `SELECT id, user_id, title, survey_id, cohort_id, type, created_at, updated_at 
       FROM chat_conversations 
       WHERE user_id = ? 
       ORDER BY updated_at DESC`,
      [userId]
    );

    // Then fetch messages for each conversation individually
    const conversations: Conversation[] = [];
    for (const row of metadataRows) {
      const [messageRows] = await db.execute<RowDataPacket[]>(
        `SELECT messages FROM chat_conversations WHERE id = ?`,
        [row.id]
      );
      
      conversations.push({
        id: row.id,
        title: row.title,
        messages: messageRows.length > 0 
          ? (typeof messageRows[0].messages === 'string' ? JSON.parse(messageRows[0].messages) : messageRows[0].messages)
          : [],
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        surveyId: row.survey_id,
        cohortId: row.cohort_id,
        type: row.type,
        userId: row.user_id.toString()
      });
    }
    
    return NextResponse.json({ 
      status: true, 
      conversations
    });
  } catch (error) {
    console.error('Error loading conversations:', error);
    return NextResponse.json({ error: 'Failed to load conversations' }, { status: 500 });
  }
}

// POST - Save conversation
export async function POST(request: NextRequest) {
  const trace = request.headers.get('x-chat-trace-id') || `conv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id; // Keep as string, MySQL driver handles conversion
    const body = await request.json();
    const { id, title, messages, surveyId, cohortId, type } = body;
    const requestedType: 'chat' | 'news' | 'code' = (type || 'chat');
    const normalizedSurveyId = requestedType === 'news' ? null : (surveyId || null);
    const normalizedCohortId = requestedType === 'news' ? null : (cohortId || null);

    logConversation(trace, 'save_requested', {
      id,
      title,
      messageCount: messages?.length || 0,
      type: requestedType,
      surveyId: normalizedSurveyId,
      cohortId: normalizedCohortId,
    });

    if (!id || !title) {
      console.error('❌ MISSING REQUIRED FIELDS:', { id: !!id, title: !!title });
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const db = await getMySQLConnection();
    const messagesJson = JSON.stringify(messages || []);
    
    // Check if conversation exists
    const [existingRows] = await db.execute<RowDataPacket[]>(
      'SELECT id FROM chat_conversations WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    const persistConversation = async (persistType: 'chat' | 'news' | 'code') => {
      if (existingRows.length > 0) {
        // Update existing conversation
        await db.execute(
          `UPDATE chat_conversations
           SET title = ?, messages = ?, survey_id = ?, cohort_id = ?, type = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND user_id = ?`,
          [title, messagesJson, normalizedSurveyId, normalizedCohortId, persistType, id, userId]
        );
      } else {
        // Insert new conversation
        await db.execute(
          `INSERT INTO chat_conversations (id, user_id, title, messages, survey_id, cohort_id, type)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [id, userId, title, messagesJson, normalizedSurveyId, normalizedCohortId, persistType]
        );
      }
    };

    let persistedType: 'chat' | 'news' | 'code' = requestedType;
    try {
      await persistConversation(requestedType);
    } catch (error: any) {
      // Backward-compatible fallback when DB enum has not yet been migrated to include 'news'.
      const errMsg = String(error?.message || '');
      if (requestedType === 'news' && /(Data truncated|Incorrect|enum|type)/i.test(errMsg)) {
        persistedType = 'chat';
        await persistConversation('chat');
      } else {
        throw error;
      }
    }

    const conversation: Conversation = {
      id,
      title,
      messages: messages || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      surveyId: normalizedSurveyId,
      cohortId: normalizedCohortId,
      type: persistedType,
      userId: userId
    };
    logConversation(trace, 'save_completed', {
      id,
      persistedType,
      surveyId: normalizedSurveyId,
      cohortId: normalizedCohortId,
    });
    
    return NextResponse.json({ 
      status: true, 
      conversation 
    });
  } catch (error) {
    console.error('Error saving conversation:', error);
    return NextResponse.json({ error: 'Failed to save conversation' }, { status: 500 });
  }
} 