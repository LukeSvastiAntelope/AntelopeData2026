import { NextRequest, NextResponse } from 'next/server';
import { openSql } from '@/app/utils/database/db';
import {
  isResendConfigured,
  sendCandidateEmail,
} from '@/app/utils/services/email';
import type { RowDataPacket } from 'mysql2';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * POST /api/surveys/[id]/email
 *
 * Send survey invitations via Antelope platform email (Resend).
 * Candidate never leaves Antelope or logs into Resend.
 *
 * Body:
 *  - emails: string[]
 *  - subject?: string
 *  - message?: string   ({{link}} -> survey URL)
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
    const { emails, subject: customSubject, message: customMessage, mode = 'default' } = body as {
      emails: string[];
      subject?: string;
      message?: string;
      mode?: 'default' | 'canvass';
    };

    const cleanEmails = (emails || [])
      .map((e) => String(e).trim())
      .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));

    if (cleanEmails.length === 0) {
      return NextResponse.json(
        { status: false, message: 'At least one valid email address is required' },
        { status: 400 }
      );
    }
    if (cleanEmails.length > 500) {
      return NextResponse.json(
        { status: false, message: 'Maximum 500 email addresses per request' },
        { status: 400 }
      );
    }

    if (!isResendConfigured()) {
      return NextResponse.json(
        {
          status: false,
          message:
            'Platform email is not configured on the server (RESEND_API_KEY). Contact Antelope support.',
        },
        { status: 503 }
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

    const [users] = await db.execute<RowDataPacket[]>(
      `SELECT email, display_name FROM users WHERE id = ? LIMIT 1`,
      [userId]
    );
    const user = users[0];
    const userEmail = user?.email != null ? String(user.email).trim() : '';
    const displayName =
      (user?.display_name != null && String(user.display_name).trim()) ||
      userEmail.split('@')[0] ||
      'Campaign';
    const localPart =
      (userEmail.split('@')[0] || displayName)
        .toLowerCase()
        .replace(/[^a-z0-9._+-]+/g, '-')
        .slice(0, 40) || 'campaign';

    const survey = surveys[0];
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'https://antelopedata.org';
    const path = mode === 'canvass' ? `/survey/${survey.slug}/canvass` : `/survey/${survey.slug}`;
    const surveyUrl = `${baseUrl}${path}`;

    const subject = customSubject || `You're invited: ${survey.title}`;
    const messageTemplate =
      customMessage ||
      `You're invited to participate in a survey: "${survey.title}".\n\nTake it here: {{link}}`;
    const formattedMessage = messageTemplate.replace(/\{\{link\}\}/g, surveyUrl);
    const html = `<div style="font-family:sans-serif;font-size:15px;line-height:1.6;color:#111;max-width:560px;margin:0 auto">
      <p>${formattedMessage.replace(/\n/g, '<br/>')}</p>
      <p style="margin-top:24px"><a href="${surveyUrl}" style="background:#111;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block">Take the survey</a></p>
    </div>`;

    const result = await sendCandidateEmail({
      fromName: displayName,
      localPart,
      replyTo: userEmail || null,
      to: cleanEmails,
      subject,
      html,
      headers: {
        'X-Antelope-Survey-Id': String(surveyId),
      },
    });

    return NextResponse.json({
      status: true,
      sent: result.sent > 0,
      provider: result.provider,
      from: result.from,
      summary: { total: result.total, sent: result.sent, failed: result.failed },
      surveyUrl,
      formattedMessage,
    });
  } catch (error) {
    console.error('Email send error:', error);
    return NextResponse.json(
      { status: false, message: error instanceof Error ? error.message : 'Failed to send email' },
      { status: 500 }
    );
  }
}
