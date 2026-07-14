import { NextRequest, NextResponse } from 'next/server'
import { openSql } from '@/app/utils/database/db'
import { serverPrefixFromApiKey, verifyMailchimpCreds } from '@/app/utils/services/mailchimp'

export const runtime = 'nodejs'

/**
 * GET  /api/channels/email/credentials  — masked connection status for the current user
 * POST /api/channels/email/credentials  — save (or update) Mailchimp credentials
 * DELETE /api/channels/email/credentials — remove saved credentials
 */

export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 })

  const db = await openSql()
  const [rows]: any = await db.execute(
    `SELECT status, encrypted_credentials FROM user_channel_integrations
     WHERE user_id = ? AND provider = 'email'`,
    [userId]
  )

  if (!rows?.length) {
    return NextResponse.json({ status: true, connected: false })
  }

  const row = rows[0]
  const creds = row.encrypted_credentials || {}
  const isMailchimp = creds.provider === 'mailchimp'

  return NextResponse.json({
    status: true,
    connected: row.status === 'connected' && isMailchimp,
    provider: isMailchimp ? 'mailchimp' : null,
    fromEmail: isMailchimp ? creds.fromEmail || null : null,
    fromName: isMailchimp ? creds.fromName || null : null,
    listId: isMailchimp ? creds.listId || null : null,
    apiKeyMasked: isMailchimp && creds.apiKey
      ? `${creds.apiKey.slice(0, 6)}…${creds.apiKey.slice(-6)}`
      : null,
  })
}

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { apiKey, fromEmail, fromName, listId } = body as {
    apiKey?: string
    fromEmail?: string
    fromName?: string
    listId?: string
  }

  if (!apiKey || !fromEmail || !fromName) {
    return NextResponse.json(
      { status: false, message: 'apiKey, fromEmail, and fromName are required' },
      { status: 400 }
    )
  }

  const serverPrefix = serverPrefixFromApiKey(apiKey)
  if (!serverPrefix) {
    return NextResponse.json(
      { status: false, message: 'Invalid Mailchimp API key format — expected "...-usNN" suffix.' },
      { status: 400 }
    )
  }

  const verify = await verifyMailchimpCreds({ apiKey, serverPrefix, fromEmail, fromName, listId })
  if (!verify.ok) {
    return NextResponse.json(
      { status: false, message: verify.error || 'Could not verify Mailchimp credentials.' },
      { status: 400 }
    )
  }

  const db = await openSql()
  const credentials = { provider: 'mailchimp', apiKey, serverPrefix, fromEmail, fromName, listId: listId || null }
  await db.execute(
    `INSERT INTO user_channel_integrations (user_id, provider, status, encrypted_credentials)
     VALUES (?, 'email', 'connected', ?)
     ON DUPLICATE KEY UPDATE status = 'connected', encrypted_credentials = ?, updated_at = NOW()`,
    [userId, JSON.stringify(credentials), JSON.stringify(credentials)]
  )

  return NextResponse.json({ status: true, message: 'Mailchimp connected.', accountName: verify.accountName })
}

export async function DELETE(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 })

  const db = await openSql()
  await db.execute(
    `UPDATE user_channel_integrations SET status = 'revoked', encrypted_credentials = NULL
     WHERE user_id = ? AND provider = 'email'`,
    [userId]
  )

  return NextResponse.json({ status: true, message: 'Mailchimp credentials removed.' })
}
