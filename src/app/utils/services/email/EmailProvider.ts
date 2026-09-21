/**
 * Swappable email provider contract (Resend today, SES later).
 * Server-only — never import from client components.
 */

export type EmailSendRequest = {
  /** RFC From, e.g. `Jane Doe <jane@send.antelopedata.org>` */
  from: string;
  to: string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string | string[];
  headers?: Record<string, string>;
};

export type EmailSendResult = {
  /** Provider message id (empty when failed) */
  id: string;
  status: 'sent' | 'queued' | 'failed';
  error?: string;
  /** Recipients this result covers */
  to?: string[];
};

export type EmailBulkSummary = {
  total: number;
  sent: number;
  failed: number;
  results: EmailSendResult[];
  /** Provider campaign / batch correlation when available */
  provider: string;
};

/**
 * Platform email adapter. Implementations must read credentials only from
 * server env / secrets — never from request bodies or client bundles.
 */
export interface EmailProvider {
  readonly name: string;
  /**
   * Send one message (one subject/body) to one or more recipients.
   * Providers may split internally to respect per-request caps.
   */
  send(req: EmailSendRequest): Promise<EmailSendResult>;
}
