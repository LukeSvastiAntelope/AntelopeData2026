import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { openSql } from '@/app/utils/database/db';

// Stub: marks automation as run and returns success. Actual scraping/jobs can be wired later.
export async function POST(
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
    const [rows] = await db.execute<any[]>(
      'SELECT id, type, name, config FROM dashboard_automations WHERE id = ? AND user_id = ?',
      [idNum, session.user.id]
    );
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'Automation not found' }, { status: 404 });
    }
    await db.execute(
      'UPDATE dashboard_automations SET last_run_at = NOW() WHERE id = ? AND user_id = ?',
      [idNum, session.user.id]
    );
    const automation = rows[0];
    return NextResponse.json({
      status: true,
      message: `Run queued for "${automation.name}". Results will appear when the job completes.`,
      last_run_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Automations run error:', error);
    return NextResponse.json({ error: 'Failed to run automation' }, { status: 500 });
  }
}
