import { NextRequest, NextResponse } from 'next/server'
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
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const listId = parseInt(id, 10)
  if (!Number.isFinite(listId)) return NextResponse.json({ status: false, message: 'Invalid list ID' }, { status: 400 })

  const db = await openSql()
  const [lists]: any = await db.execute(
    'SELECT * FROM contact_lists WHERE id = ? AND user_id = ?',
    [listId, userId]
  )
  if (!lists?.length) return NextResponse.json({ status: false, message: 'Not found' }, { status: 404 })

  const { searchParams } = new URL(req.url)
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
  const limit = Math.min(200, Math.max(10, parseInt(searchParams.get('limit') || '50', 10)))
  const offset = (page - 1) * limit

  const [entries]: any = await db.execute(
    `SELECT id, phone, first_name, last_name, email, birthdate, age, district, zip, city, state, party
     FROM contact_list_entries WHERE list_id = ? ORDER BY id ASC LIMIT ? OFFSET ?`,
    [listId, limit, offset]
  )

  return NextResponse.json({
    status: true,
    list: lists[0],
    entries: entries || [],
    page,
    limit,
  })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 })

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
