import { NextRequest, NextResponse } from 'next/server';
import { ensurePrimaryOrgId } from '@/app/api/dashboard/persons/org';
import { openSql } from '@/app/utils/database/db';
import {
  EmailEventRepo,
  EmailSendRepo,
} from '@/app/utils/database/email-send-repo';
import {
  EMAIL_SEND_MAX_RECIPIENTS,
  prepareRecipientList,
} from '@/app/utils/services/email/recipient-list';
import {
  buildCandidateFrom,
  buildCompliantMessage,
  getEmailProvider,
  isResendConfigured,
} from '@/app/utils/services/email';
import type { RowDataPacket } from 'mysql2';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * POST /api/outbound/email/send
 *
 * In-Antelope platform send (Resend). Candidate never leaves the app.
 * P3: every message gets CAN-SPAM footer + one-click unsub; candidate
 * suppressions checked first; send + per-recipient status persisted.
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

    const subject = String(body?.subject || '').trim();
    const htmlRaw = String(body?.html || body?.body || '').trim();
    if (!subject) {
      return NextResponse.json(
        { status: false, message: 'Subject is required' },
        { status: 400 }
      );
    }
    if (!htmlRaw) {
      return NextResponse.json(
        { status: false, message: 'Message body is required' },
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

    const receiptId = `rcpt_${Date.now()}_${userId}`;
    const sendId = await EmailSendRepo.createSend({
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

    const provider = getEmailProvider();
    let sent = 0;
    let failed = 0;
    const messageIds: string[] = [];
    const recipientStatuses: Array<{
      email: string;
      status: string;
      providerMessageId: string | null;
    }> = [];

    // One provider call per recipient so each gets a unique unsub URL + message id
    for (const email of prepared.emails) {
      const compliant = buildCompliantMessage({
        html: htmlBase,
        userId,
        email,
        sendId,
        fromName: displayName,
        physicalAddress,
        extraHeaders: {
          'X-Antelope-Outbound': 'p3-compliant-send',
          'X-Antelope-Send-Id': String(sendId),
        },
      });

      const result = await provider.send({
        from,
        to: [email],
        subject,
        html: compliant.html,
        replyTo,
        headers: compliant.headers,
      });

      const ok = result.status === 'sent' || result.status === 'queued';
      if (ok) sent += 1;
      else failed += 1;
      if (result.id) messageIds.push(result.id);

      const recipientId = await EmailSendRepo.addRecipient({
        sendId,
        userId,
        organizationId: orgId,
        email,
        providerMessageId: result.id || null,
        status: ok ? 'sent' : 'failed',
        unsubTokenHash: compliant.unsubscribeTokenHash,
      });

      await EmailEventRepo.record({
        userId,
        organizationId: orgId,
        sendId,
        recipientId,
        email,
        eventType: ok ? 'email.sent' : 'email.failed',
        providerMessageId: result.id || null,
        payload: {
          error: result.error || null,
          from,
          subject,
        },
      });

      recipientStatuses.push({
        email,
        status: ok ? 'sent' : 'failed',
        providerMessageId: result.id || null,
      });
    }

    const receipt = {
      id: receiptId,
      sendId,
      provider: provider.name,
      from,
      subject,
      sentAt: new Date().toISOString(),
      summary: {
        total: prepared.emails.length,
        sent,
        failed,
      },
      prepared: {
        rawCount: prepared.rawCount,
        validCount: prepared.emails.length,
        invalidCount: prepared.invalidCount,
        duplicateCount: prepared.duplicateCount,
        suppressedCount: prepared.suppressedCount,
      },
      canSpam: true,
      messageIds: messageIds.slice(0, 10),
      recipients: recipientStatuses.slice(0, 100),
    };

    return NextResponse.json({
      status: true,
      sent: sent > 0,
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
