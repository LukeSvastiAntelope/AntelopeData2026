import { NextRequest, NextResponse } from 'next/server'
import { requireUserId } from '@/app/utils/auth/require-user';
import { openSql } from '@/app/utils/database/db'

export const runtime = 'nodejs'

/**
 * GET  /api/channels/sms/credentials  — return masked credential status for the current user
 * POST /api/channels/sms/credentials  — save (or update) Twilio credentials
 * DELETE /api/channels/sms/credentials — remove saved credentials
 */

export async function GET(req: NextRequest) {
  const auth = requireUserId(req);
  if (typeof auth !== 'string') return auth;
  const userId = Number(auth);

  const db = await openSql()
  await db.execute(
    `UPDATE user_channel_integrations SET status = 'revoked', encrypted_credentials = NULL
     WHERE user_id = ? AND provider = 'sms_twilio'`,
    [userId]
  )

  return NextResponse.json({ status: true, message: 'SMS credentials removed.' })
}
