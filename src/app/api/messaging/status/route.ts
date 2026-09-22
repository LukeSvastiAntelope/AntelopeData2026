import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/app/utils/auth/require-user';
import { getTwilioStatus } from '@/app/utils/services/twilio';
import { isResendConfigured, EMAIL_SEND_DOMAIN } from '@/app/utils/services/email';

export const runtime = 'nodejs';

/** GET /api/messaging/status — non-secret SMS/WhatsApp/Email readiness for the current user. */
export async function GET(request: NextRequest) {
  const auth = requireUserId(request);
    if (typeof auth !== 'string') return auth;
    const userId = Number(auth);
  const s = getTwilioStatus();
  const emailConfigured = isResendConfigured();
  return NextResponse.json({
    status: true,
    authConfigured: s.authConfigured,
    smsConfigured: s.smsConfigured,
    whatsappConfigured: s.whatsappConfigured,
    // Reveal only the sender numbers (public-facing), never the keys.
    smsFrom: s.smsFrom,
    whatsappFrom: s.whatsappFrom,
    emailConfigured,
    emailFrom: emailConfigured ? EMAIL_SEND_DOMAIN : null,
    emailProvider: emailConfigured ? 'resend' : null,
  });
}
