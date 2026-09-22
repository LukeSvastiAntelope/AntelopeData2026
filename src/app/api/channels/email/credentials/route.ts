import { NextRequest, NextResponse } from 'next/server'
import { requireUserId } from '@/app/utils/auth/require-user';
import { openSql } from '@/app/utils/database/db'
import { serverPrefixFromApiKey, verifyMailchimpCreds } from '@/app/utils/services/mailchimp'

export const runtime = 'nodejs'

/**
 * GET  /api/channels/email/credentials  — masked connection status for the current user
 * POST /api/channels/email/credentials  — save (or update) Mailchimp credentials
 * DELETE /api/channels/email/credentials — remove saved credentials
 */

export async function GET(req: NextRequest) {
  const auth = requireUserId(req);
  if (typeof auth !== 'string') return auth;
  const userId = Number(auth);

  const db = await openSql()
  await db.execute(
    `UPDATE user_channel_integrations SET status = 'revoked', encrypted_credentials = NULL
     WHERE user_id = ? AND provider = 'email'`,
    [userId]
  )

  return NextResponse.json({ status: true, message: 'Mailchimp credentials removed.' })
}
