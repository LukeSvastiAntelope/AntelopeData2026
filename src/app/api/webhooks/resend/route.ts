/**
 * POST /api/webhooks/resend
 *
 * Resend (Svix) webhook — delivered / opened / bounced / complained.
 * Updates per-recipient status, records email_events (event stream),
 * and writes candidate-scoped suppressions for hard bounce + complaint.
 *
 * Never logs RESEND_API_KEY. Optional RESEND_WEBHOOK_SECRET for Svix verify.
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  EmailEventRepo,
  EmailSendRepo,
  EmailSuppressionRepo,
  type EmailRecipientStatus,
} from '@/app/utils/database/email-send-repo';

export const runtime = 'nodejs';

type ResendWebhookBody = {
  type?: string;
  created_at?: string;
  data?: {
    email_id?: string;
    from?: string;
    to?: string[] | string;
    subject?: string;
    bounce?: { type?: string; message?: string };
    [key: string]: unknown;
  };
};

function mapEventType(type: string): EmailRecipientStatus | null {
  switch (type) {
    case 'email.delivered':
      return 'delivered';
    case 'email.opened':
      return 'opened';
    case 'email.bounced':
      return 'bounced';
    case 'email.complained':
      return 'complained';
    case 'email.failed':
      return 'failed';
    case 'email.sent':
      return 'sent';
    default:
      return null;
  }
}

/**
 * Verify Svix signature when RESEND_WEBHOOK_SECRET is set.
 * Secret format: whsec_<base64>
 */
function verifySvix(
  rawBody: string,
  headers: Headers,
  secret: string
): boolean {
  const msgId = headers.get('svix-id');
  const timestamp = headers.get('svix-timestamp');
  const signatureHeader = headers.get('svix-signature');
  if (!msgId || !timestamp || !signatureHeader) return false;

  // Reject stale timestamps (>5 min)
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) {
    return false;
  }

  const secretBytes = secret.startsWith('whsec_')
    ? Buffer.from(secret.slice(6), 'base64')
    : Buffer.from(secret, 'utf8');

  const toSign = `${msgId}.${timestamp}.${rawBody}`;
  const expected = createHmac('sha256', secretBytes).update(toSign).digest('base64');

  const parts = signatureHeader.split(' ');
  for (const part of parts) {
    const [version, sig] = part.split(',');
    if (version !== 'v1' || !sig) continue;
    try {
      const a = Buffer.from(sig);
      const b = Buffer.from(expected);
      if (a.length === b.length && timingSafeEqual(a, b)) return true;
    } catch {
      /* continue */
    }
  }
  return false;
}

function firstTo(data: ResendWebhookBody['data']): string | null {
  if (!data?.to) return null;
  if (Array.isArray(data.to)) {
    const t = data.to[0];
    return t ? String(t).toLowerCase() : null;
  }
  return String(data.to).toLowerCase();
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();

    if (secret) {
      if (!verifySvix(rawBody, request.headers, secret)) {
        return NextResponse.json({ status: false, message: 'Invalid signature' }, { status: 401 });
      }
    }

    const body = JSON.parse(rawBody || '{}') as ResendWebhookBody;
    const type = String(body.type || '');
    const emailId = body.data?.email_id ? String(body.data.email_id) : '';
    if (!type || !emailId) {
      return NextResponse.json({ status: true, ignored: true, reason: 'missing type or email_id' });
    }

    const status = mapEventType(type);
    const toEmail = firstTo(body.data);

    let recipient = null as Awaited<
      ReturnType<typeof EmailSendRepo.updateRecipientByProviderId>
    >;

    if (status) {
      recipient = await EmailSendRepo.updateRecipientByProviderId({
        providerMessageId: emailId,
        status,
      });
    }

    // If we don't have a matching send row yet, still ack (Resend retries on 4xx/5xx)
    if (!recipient) {
      return NextResponse.json({
        status: true,
        matched: false,
        type,
        emailId,
      });
    }

    await EmailEventRepo.record({
      userId: recipient.userId,
      organizationId: recipient.organizationId,
      sendId: recipient.sendId,
      recipientId: recipient.recipientId,
      email: recipient.email || toEmail,
      eventType: type,
      providerMessageId: emailId,
      payload: {
        created_at: body.created_at || null,
        bounce: body.data?.bounce || null,
        subject: body.data?.subject || null,
      },
    });

    // Wire bounce / complaint straight into candidate-scoped suppression
    const bounceType =
      body.data?.bounce && typeof body.data.bounce === 'object'
        ? String((body.data.bounce as { type?: string }).type || '')
        : '';
    const isHardBounce =
      type === 'email.bounced' &&
      (bounceType.toLowerCase() === 'permanent' ||
        bounceType.toLowerCase() === 'hard' ||
        !bounceType); // treat unknown bounce as hard to protect deliverability

    if (type === 'email.complained' || isHardBounce) {
      const email = (recipient.email || toEmail || '').toLowerCase();
      if (email) {
        await EmailSuppressionRepo.add({
          userId: recipient.userId,
          organizationId: recipient.organizationId,
          email,
          reason: type === 'email.complained' ? 'complaint' : 'bounce',
          source: 'resend_webhook',
          notes: type === 'email.complained' ? 'spam complaint' : `bounce:${bounceType || 'permanent'}`,
        });
      }
    }

    return NextResponse.json({
      status: true,
      matched: true,
      type,
      recipientId: recipient.recipientId,
      suppressed: type === 'email.complained' || isHardBounce,
    });
  } catch (error) {
    console.error('[webhooks/resend]', error instanceof Error ? error.message : 'error');
    return NextResponse.json(
      { status: false, message: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}
