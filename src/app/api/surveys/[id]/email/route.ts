import { NextRequest, NextResponse } from 'next/server';
import { ensurePrimaryOrgId } from '@/app/api/dashboard/persons/org';
import { openSql } from '@/app/utils/database/db';
import { EmailSendRepo } from '@/app/utils/database/email-send-repo';
import {
  buildCandidateFrom,
  isResendConfigured,
  prepareRecipientList,
  sendCompliantBulk,
  getEmailProvider,
} from '@/app/utils/services/email';
import type { RowDataPacket } from 'mysql2';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * POST /api/surveys/[id]/email
 *
 * Send survey invitations via Antelope platform email (Resend).
 * Candidate never leaves Antelope. P4: sendCompliantBulk (batch + CAN-SPAM).
 *
 * Body:
 *  - emails: string[]
 *  - subject?: string
 *  - message?: string   ({{link}} -> survey URL)
 *  - mode?: "default" | "canvass"
 *  - sendId?: number    (optional resume)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: surveyId } = await params;
    const userIdHeader = request.headers.get('x-user-id');

    if (!userIdHeader) {
      return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
    }
    const userId = Number(userIdHeader);
    if (!Number.isFinite(userId) || userId <= 0) {
      return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      emails,
      subject: customSubject,
      message: customMessage,
      mode = 'default',
      sendId: resumeSendIdRaw,
    } = body as {
      emails: string[];
      subject?: string;
      message?: string;
      mode?: 'default' | 'canvass';
      sendId?: number;
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

    const orgId = await ensurePrimaryOrgId(String(userId));
    const db = await openSql();
    const [surveys]: any = await db.execute(
      'SELECT id, slug, title FROM surveys WHERE id = ? AND created_by = ?',
      [surveyId, userId]
    );
    if (!surveys || surveys.length === 0) {
      return NextResponse.json({ status: false, message: 'Survey not found' }, { status: 404 });
    }

    const prepared = await prepareRecipientList({
      organizationId: orgId,
      userId,
      raw: cleanEmails,
    });
    if (!prepared.emails.length) {
      return NextResponse.json(
        {
          status: false,
          message:
            prepared.suppressedCount > 0
              ? 'All addresses were on your suppression list or invalid.'
              : 'No valid email addresses after validation.',
          prepared: {
            rawCount: prepared.rawCount,
            invalidCount: prepared.invalidCount,
            duplicateCount: prepared.duplicateCount,
            suppressedCount: prepared.suppressedCount,
          },
        },
        { status: 400 }
      );
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

    const { from, replyTo } = buildCandidateFrom({
      fromName: displayName,
      localPart,
      replyTo: userEmail || null,
    });

    let sendId: number;
    const resumeSendId =
      resumeSendIdRaw != null ? Number(resumeSendIdRaw) : null;
    if (resumeSendId != null && Number.isFinite(resumeSendId) && resumeSendId > 0) {
      const owned = await EmailSendRepo.getOwnedSend(resumeSendId, userId, orgId);
      if (!owned) {
        return NextResponse.json(
          { status: false, message: 'Send not found for this account' },
          { status: 404 }
        );
      }
      sendId = owned.id;
    } else {
      sendId = await EmailSendRepo.createSend({
        userId,
        organizationId: orgId,
        subject,
        fromAddress: from,
        provider: getEmailProvider().name,
        receiptId: `rcpt_survey_${surveyId}_${Date.now()}`,
        summary: {
          surveyId: Number(surveyId),
          total: prepared.emails.length,
          prepared: {
            rawCount: prepared.rawCount,
            suppressedCount: prepared.suppressedCount,
          },
        },
      });
    }

    const bulk = await sendCompliantBulk({
      userId,
      organizationId: orgId,
      sendId,
      from,
      replyTo,
      subject,
      htmlBase: html,
      fromName: displayName,
      emails: prepared.emails,
      extraHeaders: {
        'X-Antelope-Survey-Id': String(surveyId),
      },
      outboundTag: 'p4-survey-send',
    });

    return NextResponse.json({
      status: true,
      sent: bulk.summary.sent > 0 || bulk.summary.skipped > 0,
      provider: bulk.provider,
      from: bulk.from,
      sendId: bulk.sendId,
      summary: {
        total: bulk.summary.total,
        sent: bulk.summary.sent,
        failed: bulk.summary.failed,
        skipped: bulk.summary.skipped,
        batchRequests: bulk.summary.batchRequests,
      },
      surveyUrl,
      formattedMessage,
      canSpam: true,
    });
  } catch (error) {
    console.error('Email send error:', error);
    return NextResponse.json(
      { status: false, message: error instanceof Error ? error.message : 'Failed to send email' },
      { status: 500 }
    );
  }
}
