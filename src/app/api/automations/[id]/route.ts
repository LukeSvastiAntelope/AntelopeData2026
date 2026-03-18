import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { openSql } from '@/app/utils/database/db';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { id } = await params;
    const idNum = parseInt(id, 10);
    if (Number.isNaN(idNum)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }
    const db = await openSql();
    const [result] = await db.execute<any>(
      'DELETE FROM dashboard_automations WHERE id = ? AND user_id = ?',
      [idNum, session.user.id]
    );
    const affected = (result as any)?.affectedRows ?? 0;
    if (affected === 0) {
      return NextResponse.json({ error: 'Automation not found' }, { status: 404 });
    }
    return NextResponse.json({ status: true, message: 'Automation deleted' });
  } catch (error) {
    console.error('Automations DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete automation' }, { status: 500 });
  }
}
