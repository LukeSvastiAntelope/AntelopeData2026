import { NextRequest, NextResponse } from 'next/server';
import { ensurePrimaryOrgId } from '@/app/api/dashboard/persons/org';
import { openSql } from '@/app/utils/database/db';
import { EmailSendRepo } from '@/app/utils/database/email-send-repo';
import {
  EMAIL_SEND_MAX_RECIPIENTS,
  prepareRecipientList,
} from '@/app/utils/services/email/recipient-list';
import {
  buildCandidateFrom,
  getEmailProvider,
  isResendConfigured,
  sendCompliantBulk,
} from '@/app/utils/services/email';
import type { RowDataPacket } from 'mysql2';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * POST /api/outbound/email/send
 *
 * In-Antelope platform send (Resend). Candidate never leaves the app.
 * P4: batch + resume via sendCompliantBulk; optional body.sendId resumes.
 */
export async function POST(request: NextRequest) {
  try {
    const userIdHeader = request.headers.get('x-user-id');
    if (!userIdHeader) {
      return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
    }
    const userId = Number(userIdHeader);
    if (!Number.isFinite(userId) || userId <= 0) {
      return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
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
    const body = await request.json().catch(() => ({}));

    const rawEmails = Array.isArray(body?.emails)
      ? body.emails.map((e: unknown) => String(e))
      : typeof body?.emails === 'string'
        ? String(body.emails).split(/[\n,;]+/)
        : [];

    if (!rawEmails.length) {
      return NextResponse.json(
        { status: false, message: 'At least one email address is required' },
        { status: 400 }
      );
    }
    if (rawEmails.length > EMAIL_SEND_MAX_RECIPIENTS) {
      return NextResponse.json(
        {
          status: false,
          message: `Maximum ${EMAIL_SEND_MAX_RECIPIENTS} addresses per send`,
        },
        { status: 400 }
      );
    }

    const htmlRaw = String(body?.html || body?.body || '').trim();
    const subjectFromBody = String(body?.subject || '').trim();

    const resumeSendIdRaw = body?.sendId;
    const resumeSendId =
      resumeSendIdRaw != null && String(resumeSendIdRaw).trim() !== ''
        ? Number(resumeSendIdRaw)
        : null;

    let ownedSend: Awaited<ReturnType<typeof EmailSendRepo.getOwnedSend>> = null;
    if (resumeSendId != null) {
      if (!Number.isFinite(resumeSendId) || resumeSendId <= 0) {
        return NextResponse.json(
          { status: false, message: 'Invalid sendId' },
          { status: 400 }
        );
      }
      ownedSend = await EmailSendRepo.getOwnedSend(resumeSendId, userId, orgId);
      if (!ownedSend) {
        return NextResponse.json(
          { status: false, message: 'Send not found for this account' },
          { status: 404 }
        );
      }
    }

    const subject = subjectFromBody || ownedSend?.subject || '';
    if (!subject) {
      return NextResponse.json(
        { status: false, message: 'Subject is required' },
        { status: 400 }
      );
    }
    if (!htmlRaw && !ownedSend) {
      return NextResponse.json(
        { status: false, message: 'Message body is required' },
        { status: 400 }
      );
    }
    if (!htmlRaw) {
      return NextResponse.json(
        {
          status: false,
          message: 'Message body is required to resume (pass the same body)',
        },
        { status: 400 }
      );
    }

    const htmlBase = /<[a-z][\s\S]*>/i.test(htmlRaw)
      ? htmlRaw
      : `<div style="font-family:sans-serif;font-size:15px;line-height:1.6;color:#111;max-width:560px;margin:0 auto">${htmlRaw
          .split(/\n{2,}/)
          .map((p) => `<p>${p.replace(/\n/g, '<br/>')}</p>`)
          .join('\n')}</div>`;

    const prepared = await prepareRecipientList({
      organizationId: orgId,
      userId,
      raw: rawEmails,
    });

    if (!prepared.emails.length) {
      return NextResponse.json(
        {
          status: false,
          message:
            prepared.suppressedCount > 0
              ? 'All addresses were invalid, duplicates, or on your suppression list.'
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

    const db = await openSql();
    const [users] = await db.execute<RowDataPacket[]>(
      `SELECT email, display_name FROM users WHERE id = ? LIMIT 1`,
      [userId]
    );
    const user = users[0];
    const userEmail = user?.email != null ? String(user.email).trim() : '';
    const displayName =
      String(body?.fromName || '').trim() ||
      (user?.display_name != null && String(user.display_name).trim()) ||
      userEmail.split('@')[0] ||
      'Campaign';
    const localPart =
      (userEmail.split('@')[0] || displayName)
        .toLowerCase()
        .replace(/[^a-z0-9._+-]+/g, '-')
        .slice(0, 40) || 'campaign';

    const { from, replyTo } = buildCandidateFrom({
      fromName: displayName.slice(0, 80),
      localPart,
      replyTo: String(body?.replyTo || userEmail || '').trim() || null,
    });

    const physicalAddress =
      typeof body?.physicalAddress === 'string' ? body.physicalAddress : null;

    let sendId: number;
    let receiptId: string;
    if (ownedSend) {
      sendId = ownedSend.id;
      receiptId = ownedSend.receiptId || `rcpt_${Date.now()}_${userId}`;
    } else {
      receiptId = `rcpt_${Date.now()}_${userId}`;
      sendId = await EmailSendRepo.createSend({
        userId,
        organizationId: orgId,
        subject,
        fromAddress: from,
        provider: getEmailProvider().name,
        receiptId,
        summary: {
          total: prepared.emails.length,
          prepared: {
            rawCount: prepared.rawCount,
            invalidCount: prepared.invalidCount,
            duplicateCount: prepared.duplicateCount,
            suppressedCount: prepared.suppressedCount,
          },
        },
      });
    }

    const bulk = await sendCompliantBulk({
      userId,
      organizationId: orgId,
      sendId,
      from: ownedSend?.fromAddress || from,
      replyTo,
      subject: ownedSend?.subject || subject,
      htmlBase,
      fromName: displayName,
      physicalAddress,
      emails: prepared.emails,
      outboundTag: 'p4-compliant-send',
    });

    const receipt = {
      id: receiptId,
      sendId: bulk.sendId,
      provider: bulk.provider,
      from: bulk.from,
      subject: bulk.subject,
      sentAt: bulk.sentAt,
      summary: {
        total: prepared.emails.length,
        sent: bulk.summary.sent,
        failed: bulk.summary.failed,
        skipped: bulk.summary.skipped,
        batchRequests: bulk.summary.batchRequests,
      },
      prepared: {
        rawCount: prepared.rawCount,
        validCount: prepared.emails.length,
        invalidCount: prepared.invalidCount,
        duplicateCount: prepared.duplicateCount,
        suppressedCount: prepared.suppressedCount,
      },
      canSpam: true as const,
      resumed: Boolean(ownedSend),
      messageIds: bulk.messageIds,
      recipients: bulk.recipients,
    };

    return NextResponse.json({
      status: true,
      sent: bulk.summary.sent > 0 || bulk.summary.skipped > 0,
      receipt,
    });
  } catch (error) {
    console.error('[outbound/email/send]', error);
    return NextResponse.json(
      { status: false, message: error instanceof Error ? error.message : 'Send failed' },
      { status: 500 }
    );
  }
}
