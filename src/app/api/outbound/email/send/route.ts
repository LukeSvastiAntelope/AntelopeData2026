import { NextRequest, NextResponse } from 'next/server';
import { ensurePrimaryOrgId } from '@/app/api/dashboard/persons/org';
import { openSql } from '@/app/utils/database/db';
import {
  EMAIL_SEND_MAX_RECIPIENTS,
  prepareRecipientList,
} from '@/app/utils/services/email/recipient-list';
import {
  isResendConfigured,
  sendCandidateEmail,
} from '@/app/utils/services/email';
import type { RowDataPacket } from 'mysql2';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * POST /api/outbound/email/send
 *
 * In-Antelope platform send (Resend). Candidate never leaves the app.
 * Body: { emails: string[], subject, html | body, fromName?, replyTo? }
 * Returns a receipt — no external redirect / connect step.
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

    // Allow plain text body — wrap as simple HTML paragraphs
    const html = /<[a-z][\s\S]*>/i.test(htmlRaw)
      ? htmlRaw
      : `<div style="font-family:sans-serif;font-size:15px;line-height:1.6;color:#111;max-width:560px;margin:0 auto">${htmlRaw
          .split(/\n{2,}/)
          .map((p) => `<p>${p.replace(/\n/g, '<br/>')}</p>`)
          .join('\n')}</div>`;

    const prepared = await prepareRecipientList({
      organizationId: orgId,
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

    const result = await sendCandidateEmail({
      fromName: displayName.slice(0, 80),
      localPart,
      replyTo: String(body?.replyTo || userEmail || '').trim() || null,
      to: prepared.emails,
      subject,
      html,
      headers: {
        'X-Antelope-Outbound': 'p2-in-app-send',
      },
    });

    const receipt = {
      id: `rcpt_${Date.now()}_${result.results.find((r) => r.id)?.id?.slice(0, 8) || 'ok'}`,
      provider: result.provider,
      from: result.from,
      subject,
      sentAt: new Date().toISOString(),
      summary: {
        total: result.total,
        sent: result.sent,
        failed: result.failed,
      },
      prepared: {
        rawCount: prepared.rawCount,
        validCount: prepared.emails.length,
        invalidCount: prepared.invalidCount,
        duplicateCount: prepared.duplicateCount,
        suppressedCount: prepared.suppressedCount,
      },
      /** First few provider message ids for support */
      messageIds: result.results
        .filter((r) => r.id)
        .slice(0, 10)
        .map((r) => r.id),
    };

    return NextResponse.json({
      status: true,
      sent: result.sent > 0,
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
