/**
 * Platform email facade — server-only.
 *
 * Candidates never touch Resend. Antelope owns RESEND_API_KEY and the
 * send.antelopedata.org domain. Swap providers by changing getEmailProvider().
 */

import type {
  EmailBulkSummary,
  EmailProvider,
  EmailSendRequest,
  EmailSendResult,
} from './EmailProvider';
import {
  getResendProvider,
  isResendConfigured,
  RESEND_MAX_BATCH,
  ResendEmailProvider,
} from './resend-provider';

export type { EmailProvider, EmailSendRequest, EmailSendResult, EmailBulkSummary };
export { isResendConfigured, ResendEmailProvider };

export const EMAIL_SEND_DOMAIN =
  process.env.EMAIL_SEND_DOMAIN?.trim() || 'send.antelopedata.org';

/** Max recipients we accept in one API call before chunking/queueing. */
export const EMAIL_QUEUE_CHUNK = RESEND_MAX_BATCH;

/**
 * Resolve the active provider. Today: Resend. Later: SES adapter, same interface.
 */
export function getEmailProvider(): EmailProvider {
  // Future: if (process.env.EMAIL_PROVIDER === 'ses') return getSesProvider();
  return getResendProvider();
}

/**
 * Build a per-candidate From on the platform domain + Reply-To isolation.
 * From: `{Name} <{local}@send.antelopedata.org>`
 * Reply-To: candidate's real inbox (so replies never hit the shared domain mailbox).
 */
export function buildCandidateFrom(opts: {
  /** Display name shown in the From header */
  fromName: string;
  /** Local-part before @send.antelopedata.org (sanitized) */
  localPart?: string | null;
  /** Candidate's real email for Reply-To */
  replyTo?: string | null;
}): { from: string; replyTo?: string } {
  const name = String(opts.fromName || 'Campaign').trim().slice(0, 80) || 'Campaign';
  const local = sanitizeLocalPart(opts.localPart || 'campaign');
  const from = `${name} <${local}@${EMAIL_SEND_DOMAIN}>`;
  const replyTo = opts.replyTo?.trim() || undefined;
  return { from, replyTo };
}

function sanitizeLocalPart(raw: string): string {
  const cleaned = String(raw || 'campaign')
    .toLowerCase()
    .replace(/[^a-z0-9._+-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return cleaned || 'campaign';
}

/**
 * Send identical content to many recipients, batched to provider limits.
 * Each recipient gets their own provider call in batch-sized waves so large
 * lists queue safely without exceeding Resend per-request caps.
 */
export async function sendBulkEmail(opts: {
  from: string;
  replyTo?: string;
  to: string[];
  subject: string;
  html: string;
  text?: string;
  headers?: Record<string, string>;
  /** Recipients per wave (default EMAIL_QUEUE_CHUNK). */
  chunkSize?: number;
  provider?: EmailProvider;
}): Promise<EmailBulkSummary> {
  const provider = opts.provider || getEmailProvider();
  const recipients = [
    ...new Set(opts.to.map((e) => String(e).trim().toLowerCase()).filter(Boolean)),
  ];
  const chunkSize = Math.min(
    Math.max(1, opts.chunkSize || EMAIL_QUEUE_CHUNK),
    EMAIL_QUEUE_CHUNK
  );

  const results: EmailSendResult[] = [];

  for (let i = 0; i < recipients.length; i += chunkSize) {
    const wave = recipients.slice(i, i + chunkSize);
    // Parallel within a wave (one recipient per send for clean ids / bounce isolation)
    const settled = await Promise.all(
      wave.map((email) =>
        provider.send({
          from: opts.from,
          to: [email],
          subject: opts.subject,
          html: opts.html,
          text: opts.text,
          replyTo: opts.replyTo,
          headers: opts.headers,
        })
      )
    );
    results.push(...settled);
  }

  const sent = results.filter((r) => r.status === 'sent' || r.status === 'queued').length;
  const failed = results.length - sent;

  return {
    total: recipients.length,
    sent,
    failed,
    results,
    provider: provider.name,
  };
}

/**
 * Convenience: candidate-isolated bulk send through the platform provider.
 */
export async function sendCandidateEmail(opts: {
  fromName: string;
  localPart?: string | null;
  replyTo?: string | null;
  to: string[];
  subject: string;
  html: string;
  text?: string;
  headers?: Record<string, string>;
}): Promise<EmailBulkSummary & { from: string }> {
  if (!isResendConfigured() && !process.env.EMAIL_PROVIDER) {
    // Still call getEmailProvider so missing-key error is consistent
  }
  const { from, replyTo } = buildCandidateFrom({
    fromName: opts.fromName,
    localPart: opts.localPart,
    replyTo: opts.replyTo,
  });
  const summary = await sendBulkEmail({
    from,
    replyTo,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
    headers: opts.headers,
  });
  return { ...summary, from };
}
