import { NextRequest, NextResponse } from 'next/server';
import { openSql } from '@/app/utils/database/db';
import { normalizePhone } from '@/app/utils/services/twilio';
import { getMailchimpCreds, sendSurveySmsCampaign } from '@/app/utils/services/mailchimp';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * POST /api/surveys/[id]/sms-mailchimp
 *
 * Send SMS survey invitations via Mailchimp SMS campaigns (uses the same
 * Mailchimp account/credentials as the Email tab). Falls back to returning
 * the formatted message for manual send when Mailchimp isn't connected,
 * matching the Twilio SMS/WhatsApp routes' UX.
 *
 * Body:
 *  - phoneNumbers: string[]  (E.164 format, e.g. ["+15551234567"])
 *  - message?: string        ({{link}} -> survey URL)
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

    const defaultMessage = `You're invited to take a survey: "${survey.title}". {{link}}`;
    const messageTemplate = customMessage || defaultMessage;
    const formattedMessage = messageTemplate.replace(/\{\{link\}\}/g, surveyUrl);

    const creds = await getMailchimpCreds(userId);
    if (!creds) {
      return NextResponse.json({
        status: true,
        sent: false,
        reason: 'mailchimp_not_configured',
        message: 'Mailchimp is not connected. Connect it under Channels, or copy the message below and send it manually.',
        formattedMessage,
        surveyUrl,
        phoneNumbers: numbers,
      });
    }

    try {
      const { campaignId, summary } = await sendSurveySmsCampaign({
        creds,
        phones: numbers,
        messageBody: formattedMessage,
        campaignTitle: `${survey.title} — SMS invite`,
      });

      return NextResponse.json({
        status: true,
        sent: true,
        summary: { total: summary.total, sent: summary.added, failed: summary.failed },
        campaignId,
        surveyUrl,
        formattedMessage,
      });
    } catch (sendError: any) {
      // Known, actionable Mailchimp account-state blocker (list not yet
      // activated for API sends) — surface as a graceful fallback rather
      // than a hard error, same UX as the "not configured" branch above.
      const detail = sendError?.message || 'Mailchimp SMS send failed';
      const listInactive = detail.includes('not yet activated for API sends');
      return NextResponse.json({
        status: true,
        sent: false,
        reason: listInactive ? 'list_inactive' : 'mailchimp_error',
        message: detail,
        formattedMessage,
        surveyUrl,
        phoneNumbers: numbers,
      });
    }
  } catch (error) {
    console.error('Mailchimp SMS send error:', error);
    return NextResponse.json(
      { status: false, message: error instanceof Error ? error.message : 'Failed to send SMS via Mailchimp' },
      { status: 500 }
    );
  }
}
