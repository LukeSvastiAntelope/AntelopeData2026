import { NextRequest, NextResponse } from 'next/server';
import { openSql } from '@/app/utils/database/db';
import { getTwilioStatus, sendMessages, normalizePhone } from '@/app/utils/services/twilio';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * POST /api/surveys/[id]/whatsapp
 *
 * Send WhatsApp survey invitations via Twilio. Same shape as the SMS route but
 * delivered over the WhatsApp channel (TWILIO_WHATSAPP_FROM sender).
 *
 * Body:
 *  - phoneNumbers: string[]  (E.164, e.g. ["+15551234567"])
 *  - message?: string        (custom template, {{link}} -> survey URL)
 *  - mode?: "default" | "canvass"
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: surveyId } = await params;
    const userId = request.headers.get('x-user-id');

    if (!userId) {
      return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { phoneNumbers, message: customMessage, mode = 'default' } = body as {
      phoneNumbers: string[];
      message?: string;
      mode?: 'default' | 'canvass';
    };

    if (!phoneNumbers || phoneNumbers.length === 0) {
      return NextResponse.json(
        { status: false, message: 'At least one phone number is required' },
        { status: 400 }
      );
    }

    if (phoneNumbers.length > 500) {
      return NextResponse.json(
        { status: false, message: 'Maximum 500 phone numbers per request' },
        { status: 400 }
      );
    }

    const numbers = phoneNumbers.map((p) => normalizePhone(p)).filter(Boolean);
    if (numbers.length === 0) {
      return NextResponse.json(
        { status: false, message: 'No valid phone numbers after normalization' },
        { status: 400 }
      );
    }

    const db = await openSql();
    const [surveys]: any = await db.execute(
      'SELECT id, slug, title FROM surveys WHERE id = ? AND created_by = ?',
      [surveyId, userId]
    );

    if (!surveys || surveys.length === 0) {
      return NextResponse.json({ status: false, message: 'Survey not found' }, { status: 404 });
    }

    const survey = surveys[0];
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'https://antelopedata.org';
    const path = mode === 'canvass' ? `/survey/${survey.slug}/canvass` : `/survey/${survey.slug}`;
    const surveyUrl = `${baseUrl}${path}`;

    const defaultMessage = `You're invited to participate in a survey: "${survey.title}". Take it here: {{link}}`;
    const messageTemplate = customMessage || defaultMessage;
    const formattedMessage = messageTemplate.replace(/\{\{link\}\}/g, surveyUrl);

    const status = getTwilioStatus();
    if (!status.whatsappConfigured) {
      return NextResponse.json({
        status: true,
        sent: false,
        reason: status.authConfigured ? 'no_whatsapp_sender' : 'twilio_not_configured',
        message: status.authConfigured
          ? 'Twilio is connected but no WhatsApp sender is set. Enable a WhatsApp sender (or use the sandbox) and set TWILIO_WHATSAPP_FROM.'
          : 'Twilio is not configured. Copy the message below and send it manually.',
        formattedMessage,
        surveyUrl,
        phoneNumbers: numbers,
      });
    }

    const { results, summary } = await sendMessages({
      channel: 'whatsapp',
      to: numbers,
      body: formattedMessage,
    });

    return NextResponse.json({
      status: true,
      sent: true,
      summary,
      results,
      surveyUrl,
      formattedMessage,
    });
  } catch (error) {
    console.error('WhatsApp send error:', error);
    return NextResponse.json(
      { status: false, message: error instanceof Error ? error.message : 'Failed to send WhatsApp' },
      { status: 500 }
    );
  }
}
