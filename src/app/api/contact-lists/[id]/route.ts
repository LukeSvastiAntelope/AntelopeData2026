import { NextRequest, NextResponse } from 'next/server'
import { requireUserId } from '@/app/utils/auth/require-user';
import { openSql } from '@/app/utils/database/db'

export const runtime = 'nodejs'

/**
 * GET    /api/contact-lists/[id]  — fetch a single list with entries (paginated)
 * DELETE /api/contact-lists/[id]  — delete list + all entries
 */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireUserId(req);
  if (typeof auth !== 'string') return auth;
  const userId = Number(auth);

  const { id } = await params
  const listId = parseInt(id, 10)
  if (!Number.isFinite(listId)) return NextResponse.json({ status: false, message: 'Invalid list ID' }, { status: 400 })

  const db = await openSql()
  const [check]: any = await db.execute(
    'SELECT id FROM contact_lists WHERE id = ? AND user_id = ?',
    [listId, userId]
  )
  if (!check?.length) return NextResponse.json({ status: false, message: 'Not found' }, { status: 404 })

  await db.execute('DELETE FROM contact_lists WHERE id = ?', [listId])

  return NextResponse.json({ status: true, message: 'Contact list deleted.' })
}
