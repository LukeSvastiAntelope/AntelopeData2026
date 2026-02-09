import { NextRequest, NextResponse } from 'next/server';
import { openSql } from '@/app/utils/database/db';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * POST /api/surveys/[id]/sms
 *
 * Send SMS survey invitations. Uses Twilio when configured, otherwise
 * returns the formatted messages for manual send.
 *
 * Body:
 *  - phoneNumbers: string[]  (E.164 format, e.g. ["+15551234567"])
 *  - message?: string        (custom message template, {{link}} is replaced with survey URL)
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
      return NextResponse.json(
        { status: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const {
      phoneNumbers,
      message: customMessage,
      mode = 'default',
    } = body as {
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

    const db = await openSql();

    // Verify survey ownership and get slug
    const [surveys]: any = await db.execute(
      'SELECT id, slug, title FROM surveys WHERE id = ? AND created_by = ?',
      [surveyId, userId]
    );

    if (!surveys || surveys.length === 0) {
      return NextResponse.json(
        { status: false, message: 'Survey not found' },
        { status: 404 }
      );
    }

    const survey = surveys[0];
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXTAUTH_URL ||
      'https://antelope.ai';
    const path =
      mode === 'canvass'
        ? `/survey/${survey.slug}/canvass`
        : `/survey/${survey.slug}`;
    const surveyUrl = `${baseUrl}${path}`;

    const defaultMessage = `You're invited to participate in a survey: "${survey.title}". Take it here: {{link}}`;
    const messageTemplate = customMessage || defaultMessage;
    const formattedMessage = messageTemplate.replace(/\{\{link\}\}/g, surveyUrl);

    // Check if Twilio is configured
    const twilioSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioPhone = process.env.TWILIO_PHONE_NUMBER;
    const twilioConfigured = !!(twilioSid && twilioToken && twilioPhone);

    if (!twilioConfigured) {
      // Graceful fallback: return the message for manual sending
      return NextResponse.json({
        status: true,
        sent: false,
        reason: 'twilio_not_configured',
        message:
          'Twilio is not configured. Copy the message below and send it manually.',
        formattedMessage,
        surveyUrl,
        phoneNumbers,
      });
    }

    // Dynamically import Twilio to avoid errors if not installed
    let twilio: any;
    try {
      twilio = (await import('twilio')).default;
    } catch {
      return NextResponse.json({
        status: true,
        sent: false,
        reason: 'twilio_not_installed',
        message:
          'Twilio SDK is not installed. Run `npm install twilio` to enable SMS.',
        formattedMessage,
        surveyUrl,
        phoneNumbers,
      });
    }

    const client = twilio(twilioSid, twilioToken);

    const results: Array<{
      phone: string;
      status: 'sent' | 'failed';
      sid?: string;
      error?: string;
    }> = [];

    // Send in parallel batches of 10
    const batchSize = 10;
    for (let i = 0; i < phoneNumbers.length; i += batchSize) {
      const batch = phoneNumbers.slice(i, i + batchSize);
      const batchResults = await Promise.allSettled(
        batch.map(async (phone) => {
          const msg = await client.messages.create({
            body: formattedMessage,
            to: phone.trim(),
            from: twilioPhone,
          });
          return { phone, status: 'sent' as const, sid: msg.sid };
        })
      );

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          const phone = batch[batchResults.indexOf(result)];
          results.push({
            phone,
            status: 'failed',
            error: result.reason?.message || 'Unknown error',
          });
        }
      }
    }

    const sent = results.filter((r) => r.status === 'sent').length;
    const failed = results.filter((r) => r.status === 'failed').length;

    return NextResponse.json({
      status: true,
      sent: true,
      summary: { total: phoneNumbers.length, sent, failed },
      results,
      surveyUrl,
    });
  } catch (error) {
    console.error('SMS send error:', error);
    return NextResponse.json(
      {
        status: false,
        message:
          error instanceof Error ? error.message : 'Failed to send SMS',
      },
      { status: 500 }
    );
  }
}
