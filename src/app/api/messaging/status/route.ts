import { NextRequest, NextResponse } from 'next/server';
import { getTwilioStatus } from '@/app/utils/services/twilio';

export const runtime = 'nodejs';

/** GET /api/messaging/status — non-secret Twilio readiness for SMS + WhatsApp. */
export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-user-id');
  if (!userId) {
    return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
  }
  const s = getTwilioStatus();
  return NextResponse.json({
    status: true,
    authConfigured: s.authConfigured,
    smsConfigured: s.smsConfigured,
    whatsappConfigured: s.whatsappConfigured,
    // Reveal only the sender numbers (public-facing), never the keys.
    smsFrom: s.smsFrom,
    whatsappFrom: s.whatsappFrom,
  });
}
