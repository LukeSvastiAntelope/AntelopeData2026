import { NextRequest, NextResponse } from 'next/server';
import { getTwilioStatus } from '@/app/utils/services/twilio';
import { isResendConfigured, EMAIL_SEND_DOMAIN } from '@/app/utils/services/email';

export const runtime = 'nodejs';

/** GET /api/messaging/status — non-secret SMS/WhatsApp/Email readiness for the current user. */
export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-user-id');
  if (!userId) {
    return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
  }
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
