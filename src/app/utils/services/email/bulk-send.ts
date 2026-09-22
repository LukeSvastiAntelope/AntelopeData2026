/**
 * P4-3 — Shared compliant bulk send (batch + resume + per-recipient events).
 * Single place for the batch loop — outbound + survey routes call this.
 */

import {
  EmailEventRepo,
  EmailSendRepo,
} from '@/app/utils/database/email-send-repo';
import type { EmailProvider, EmailSendRequest } from './EmailProvider';
import { buildCompliantMessage } from './compliance';
import { getResendProvider } from './resend-provider';
import { RESEND_MAX_BATCH } from './resend-provider';

export type SendCompliantBulkOpts = {
  userId: number;
  organizationId: number;
  sendId: number;
  from: string;
  replyTo?: string | null;
  subject: string;
  htmlBase: string;
  fromName: string;
  physicalAddress?: string | null;
  /** Already validated + suppression-dropped by the caller. */
  emails: string[];
  /** Merged into every message's headers (after CAN-SPAM headers). */
  extraHeaders?: Record<string, string>;
  /** Test / swap — defaults to getEmailProvider(). */
  provider?: EmailProvider;
  /** Outbound marker header value (default p4-compliant-send). */
  outboundTag?: string;
};

export type CompliantBulkReceipt = {
  sendId: number;
  provider: string;
  from: string;
  subject: string;
  sentAt: string;
  summary: {
    /** Recipients requested this invocation (pre-resume filter). */
    total: number;
    sent: number;
    failed: number;
    /** Skipped because already sent/queued for this sendId. */
    skipped: number;
    /** Number of provider.sendBatch calls made. */
    batchRequests: number;
  };
  canSpam: true;
  messageIds: string[];
  recipients: Array<{
    email: string;
    status: string;
    providerMessageId: string | null;
  }>;
};

/**
 * Batch-send CAN-SPAM compliant messages, persist recipients + events,
 * skip already-sent addresses for this sendId (idempotent resume).
 */
export async function sendCompliantBulk(
  opts: SendCompliantBulkOpts
): Promise<CompliantBulkReceipt> {
  const provider = opts.provider || getResendProvider();
  const emails = [
    ...new Set(
      opts.emails.map((e) => String(e).trim().toLowerCase()).filter(Boolean)
    ),
  ];

  const alreadySent = await EmailSendRepo.loadSentEmails(opts.sendId);
  const toSend = emails.filter((e) => !alreadySent.has(e));
  const skipped = emails.length - toSend.length;

  let sent = 0;
  let failed = 0;
  let batchRequests = 0;
  const messageIds: string[] = [];
  const recipientStatuses: CompliantBulkReceipt['recipients'] = [];

  const replyTo = opts.replyTo?.trim() || undefined;
  const outboundTag = opts.outboundTag || 'p4-compliant-send';

  for (let i = 0; i < toSend.length; i += RESEND_MAX_BATCH) {
    const wave = toSend.slice(i, i + RESEND_MAX_BATCH);
    const tokenHashes: string[] = [];
    const messages: EmailSendRequest[] = wave.map((email) => {
      const compliant = buildCompliantMessage({
        html: opts.htmlBase,
        userId: opts.userId,
        email,
        sendId: opts.sendId,
        fromName: opts.fromName,
        physicalAddress: opts.physicalAddress,
        extraHeaders: {
          ...(opts.extraHeaders || {}),
          'X-Antelope-Outbound': outboundTag,
          'X-Antelope-Send-Id': String(opts.sendId),
        },
      });
      tokenHashes.push(compliant.unsubscribeTokenHash);
      return {
        from: opts.from,
        to: [email],
        subject: opts.subject,
        html: compliant.html,
        replyTo,
        headers: compliant.headers,
      };
    });

    batchRequests += 1;
    const results = await provider.sendBatch(messages);

    for (let j = 0; j < wave.length; j++) {
      const email = wave[j];
      const result = results[j] || {
        id: '',
        status: 'failed' as const,
        error: 'missing batch result',
        to: [email],
      };
      const ok = result.status === 'sent' || result.status === 'queued';
      if (ok) sent += 1;
      else failed += 1;
      if (result.id) messageIds.push(result.id);

      const recipientId = await EmailSendRepo.addRecipient({
        sendId: opts.sendId,
        userId: opts.userId,
        organizationId: opts.organizationId,
        email,
        providerMessageId: result.id || null,
        status: ok ? 'sent' : 'failed',
        unsubTokenHash: tokenHashes[j] || null,
      });

      await EmailEventRepo.record({
        userId: opts.userId,
        organizationId: opts.organizationId,
        sendId: opts.sendId,
        recipientId,
        email,
        eventType: ok ? 'email.sent' : 'email.failed',
        providerMessageId: result.id || null,
        payload: {
          error: result.error || null,
          from: opts.from,
          subject: opts.subject,
        },
      });

      recipientStatuses.push({
        email,
        status: ok ? 'sent' : 'failed',
        providerMessageId: result.id || null,
      });
    }
  }

  return {
    sendId: opts.sendId,
    provider: provider.name,
    from: opts.from,
    subject: opts.subject,
    sentAt: new Date().toISOString(),
    summary: {
      total: emails.length,
      sent,
      failed,
      skipped,
      batchRequests,
    },
    canSpam: true,
    messageIds: messageIds.slice(0, 10),
    recipients: recipientStatuses.slice(0, 100),
  };
}
