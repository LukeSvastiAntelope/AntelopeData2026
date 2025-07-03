import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';

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
    
    // For now, we'll return success
    // In production, you'd delete from database
    
    return NextResponse.json({ 
      status: true, 
      message: 'Conversation deleted successfully' 
    });
  } catch (error) {
    console.error('Error deleting conversation:', error);
    return NextResponse.json({ error: 'Failed to delete conversation' }, { status: 500 });
  }
} 