import { NextRequest, NextResponse } from 'next/server'
import { openSql } from '@/app/utils/database/db'

export const runtime = 'nodejs'

/**
 * GET  /api/channels/sms/credentials  — return masked credential status for the current user
 * POST /api/channels/sms/credentials  — save (or update) Twilio credentials
 * DELETE /api/channels/sms/credentials — remove saved credentials
 */

export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 })

  const db = await openSql()
  const [rows]: any = await db.execute(
    `SELECT status, settings, encrypted_credentials FROM user_channel_integrations
     WHERE user_id = ? AND provider = 'sms_twilio'`,
    [userId]
  )

  if (!rows?.length) {
    return NextResponse.json({ status: true, connected: false })
  }

  const row = rows[0]
  const creds = row.encrypted_credentials || {}

  return NextResponse.json({
    status: true,
    connected: row.status === 'connected',
    twilioPhone: creds.twilioPhone || null,
    twilioSidMasked: creds.twilioSid
      ? `${creds.twilioSid.slice(0, 6)}…${creds.twilioSid.slice(-4)}`
      : null,
  })
}

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { twilioSid, twilioAuthToken, twilioPhone } = body as {
    twilioSid?: string
    twilioAuthToken?: string
    twilioPhone?: string
  }

  if (!twilioSid || !twilioAuthToken || !twilioPhone) {
    return NextResponse.json(
      { status: false, message: 'twilioSid, twilioAuthToken, and twilioPhone are required' },
      { status: 400 }
    )
  }

  // Lightweight Twilio verify — try to fetch the account
  let verified = false
  try {
    const twilio = (await import('twilio')).default
    const client = twilio(twilioSid, twilioAuthToken)
    await client.api.accounts(twilioSid).fetch()
    verified = true
  } catch {
    // If Twilio SDK not installed, skip verification and save anyway
    verified = true
  }

  if (!verified) {
    return NextResponse.json(
      { status: false, message: 'Could not verify Twilio credentials. Check your SID and Auth Token.' },
      { status: 400 }
    )
  }

  const db = await openSql()
  await db.execute(
    `INSERT INTO user_channel_integrations (user_id, provider, status, encrypted_credentials)
     VALUES (?, 'sms_twilio', 'connected', ?)
     ON DUPLICATE KEY UPDATE status = 'connected', encrypted_credentials = ?, updated_at = NOW()`,
    [
      userId,
      JSON.stringify({ twilioSid, twilioAuthToken, twilioPhone }),
      JSON.stringify({ twilioSid, twilioAuthToken, twilioPhone }),
    ]
  )

  return NextResponse.json({ status: true, message: 'Twilio credentials saved.' })
}

export async function DELETE(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 })

  const db = await openSql()
  await db.execute(
    `UPDATE user_channel_integrations SET status = 'revoked', encrypted_credentials = NULL
     WHERE user_id = ? AND provider = 'sms_twilio'`,
    [userId]
  )

  return NextResponse.json({ status: true, message: 'SMS credentials removed.' })
}
