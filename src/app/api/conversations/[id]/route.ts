import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { openSql as getMySQLConnection } from '@/app/utils/database/db';

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