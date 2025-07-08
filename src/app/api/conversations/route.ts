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
  userId: string;
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
    
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT id, user_id, title, messages, survey_id, cohort_id, created_at, updated_at 
       FROM chat_conversations 
       WHERE user_id = ? 
       ORDER BY updated_at DESC`,
      [userId]
    );
    
    const conversations: Conversation[] = rows.map(row => ({
      id: row.id,
      title: row.title,
      messages: typeof row.messages === 'string' ? JSON.parse(row.messages) : row.messages,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      surveyId: row.survey_id,
      cohortId: row.cohort_id,
      userId: row.user_id.toString()
    }));
    
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
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id; // Keep as string, MySQL driver handles conversion
    const body = await request.json();
    const { id, title, messages, surveyId, cohortId } = body;

    if (!id || !title) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const db = await getMySQLConnection();
    const messagesJson = JSON.stringify(messages || []);
    
    // Check if conversation exists
    const [existingRows] = await db.execute<RowDataPacket[]>(
      'SELECT id FROM chat_conversations WHERE id = ? AND user_id = ?',
      [id, userId]
    );
    
    if (existingRows.length > 0) {
      // Update existing conversation
      await db.execute(
        `UPDATE chat_conversations 
         SET title = ?, messages = ?, survey_id = ?, cohort_id = ?, updated_at = CURRENT_TIMESTAMP 
         WHERE id = ? AND user_id = ?`,
        [title, messagesJson, surveyId || null, cohortId || null, id, userId]
      );
    } else {
      // Insert new conversation
      await db.execute(
        `INSERT INTO chat_conversations (id, user_id, title, messages, survey_id, cohort_id) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, userId, title, messagesJson, surveyId || null, cohortId || null]
      );
    }

    const conversation: Conversation = {
      id,
      title,
      messages: messages || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      surveyId,
      cohortId,
      userId: userId
    };
    
    return NextResponse.json({ 
      status: true, 
      conversation 
    });
  } catch (error) {
    console.error('Error saving conversation:', error);
    return NextResponse.json({ error: 'Failed to save conversation' }, { status: 500 });
  }
} 