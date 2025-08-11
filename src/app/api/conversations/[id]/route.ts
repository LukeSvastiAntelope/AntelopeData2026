import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { openSql as getMySQLConnection } from '@/app/utils/database/db'
import type { RowDataPacket } from 'mysql2/promise'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id
    const { id } = await params

    const db = await getMySQLConnection()

    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT id, user_id, title, messages, survey_id, cohort_id, type, created_at, updated_at
       FROM chat_conversations
       WHERE id = ? AND user_id = ?
       LIMIT 1`,
      [id, userId]
    )

    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const row = rows[0]
    const messages = typeof row.messages === 'string' ? JSON.parse(row.messages) : row.messages

    return NextResponse.json({
      status: true,
      conversation: {
        id: row.id,
        title: row.title,
        messages,
        surveyId: row.survey_id,
        cohortId: row.cohort_id,
        type: row.type,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        userId: row.user_id?.toString?.() ?? row.user_id,
      }
    })
  } catch (error) {
    console.error('Error loading conversation by id:', error)
    return NextResponse.json({ error: 'Failed to load conversation' }, { status: 500 })
  }
}

// duplicate imports removed

// DELETE - Delete conversation
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const conversationId = id;
    const userId = session.user.id; // Keep as string, MySQL driver handles conversion
    
    const db = await getMySQLConnection();
    
    // Delete the conversation, ensuring it belongs to the user
    const [result] = await db.execute(
      'DELETE FROM chat_conversations WHERE id = ? AND user_id = ?',
      [conversationId, userId]
    );
    
    return NextResponse.json({ 
      status: true, 
      message: 'Conversation deleted successfully' 
    });
  } catch (error) {
    console.error('Error deleting conversation:', error);
    return NextResponse.json({ error: 'Failed to delete conversation' }, { status: 500 });
  }
} 