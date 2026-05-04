import { NextRequest, NextResponse } from 'next/server'
import { openSql } from '@/app/utils/database/db'

export const runtime = 'nodejs'
export const maxDuration = 120

/**
 * GET  /api/contact-lists          — list all contact lists for current user
 * POST /api/contact-lists          — create a new contact list from uploaded CSV/Excel rows
 *
 * POST body (JSON):
 *  name          string        required
 *  description   string        optional
 *  source_file   string        optional — original filename
 *  filter_prompt string        optional — AI filter prompt used
 *  column_map    object        optional — { originalCol: targetField }
 *  contacts      object[]      required — array of { phone, first_name?, last_name?, email?,
 *                                           birthdate?, age?, district?, zip?, city?, state?,
 *                                           party?, ...rest }
 */

export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 })

  const db = await openSql()
  const [rows]: any = await db.execute(
    `SELECT id, name, description, source_file, filter_prompt, contact_count, created_at
     FROM contact_lists WHERE user_id = ? ORDER BY created_at DESC`,
    [userId]
  )

  return NextResponse.json({ status: true, lists: rows || [] })
}

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ status: false, message: 'Invalid JSON body' }, { status: 400 })

  const { name, description, source_file, filter_prompt, column_map, contacts } = body as {
    name: string
    description?: string
    source_file?: string
    filter_prompt?: string
    column_map?: Record<string, string>
    contacts: Record<string, string>[]
  }

  if (!name?.trim()) {
    return NextResponse.json({ status: false, message: 'name is required' }, { status: 400 })
  }
  if (!Array.isArray(contacts) || contacts.length === 0) {
    return NextResponse.json({ status: false, message: 'contacts array is required and cannot be empty' }, { status: 400 })
  }

  const db = await openSql()
  const conn = await db.getConnection()
  await conn.beginTransaction()

  try {
    const [result]: any = await conn.execute(
      `INSERT INTO contact_lists (user_id, name, description, source_file, filter_prompt, column_map, contact_count)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, name.trim(), description || null, source_file || null, filter_prompt || null,
       column_map ? JSON.stringify(column_map) : null, contacts.length]
    )
    const listId = result.insertId

    const KNOWN = ['phone', 'first_name', 'last_name', 'email', 'birthdate', 'age', 'district', 'zip', 'city', 'state', 'party']

    for (const contact of contacts) {
      const phone = (contact.phone || '').toString().trim()
      if (!phone) continue

      const extra: Record<string, string> = {}
      for (const [k, v] of Object.entries(contact)) {
        if (!KNOWN.includes(k)) extra[k] = v
      }

      await conn.execute(
        `INSERT INTO contact_list_entries
           (list_id, phone, first_name, last_name, email, birthdate, age, district, zip, city, state, party, extra_data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          listId,
          phone,
          contact.first_name || null,
          contact.last_name || null,
          contact.email || null,
          contact.birthdate || null,
          contact.age ? Number(contact.age) : null,
          contact.district || null,
          contact.zip || null,
          contact.city || null,
          contact.state || null,
          contact.party || null,
          Object.keys(extra).length ? JSON.stringify(extra) : null,
        ]
      )
    }

    await conn.commit()
    conn.release()

    return NextResponse.json({ status: true, listId, contact_count: contacts.length, message: `List "${name}" created with ${contacts.length} contacts.` })
  } catch (err) {
    await conn.rollback()
    conn.release()
    console.error('Error creating contact list:', err)
    return NextResponse.json({ status: false, message: 'Failed to create contact list' }, { status: 500 })
  }
}
