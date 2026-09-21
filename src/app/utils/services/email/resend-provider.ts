/**
 * Resend EmailProvider — platform-owned account.
 *
 * Credential: process.env.RESEND_API_KEY only (hosting secrets / .env.local).
 * NEVER import this module from client components.
 */

import type {
  EmailProvider,
  EmailSendRequest,
  EmailSendResult,
} from './EmailProvider';

const RESEND_API = 'https://api.resend.com';

/** Resend single-email `to` cap (documented). */
export const RESEND_MAX_TO_PER_REQUEST = 50;

/** Resend batch endpoint cap. */
export const RESEND_MAX_BATCH = 100;

function requireApiKey(): string {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    throw new Error(
      'RESEND_API_KEY is not configured on the server. Set it in hosting secrets / .env.local.'
    );
  }
  if (key.startsWith('re_') === false && process.env.NODE_ENV !== 'test') {
    // Soft warn only — some test doubles may omit prefix
    console.warn('[resend] RESEND_API_KEY does not look like a Resend key');
  }
  return key;
}

function normalizeTo(to: string[]): string[] {
  return [...new Set(to.map((e) => String(e).trim().toLowerCase()).filter(Boolean))];
}

async function resendFetch(
  path: string,
  init: RequestInit & { apiKey: string }
): Promise<Response> {
  const { apiKey, ...rest } = init;
  return fetch(`${RESEND_API}${path}`, {
    ...rest,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(rest.headers || {}),
    },
  });
}

function buildPayload(req: EmailSendRequest, to: string[]) {
  const payload: Record<string, unknown> = {
    from: req.from,
    to,
    subject: req.subject,
    html: req.html,
  };
  if (req.text) payload.text = req.text;
  if (req.replyTo) {
    payload.reply_to = Array.isArray(req.replyTo) ? req.replyTo : req.replyTo;
  }
  if (req.headers && Object.keys(req.headers).length) {
    payload.headers = req.headers;
  }
  return payload;
}

export class ResendEmailProvider implements EmailProvider {
  readonly name = 'resend';

  async send(req: EmailSendRequest): Promise<EmailSendResult> {
    const apiKey = requireApiKey();
    const recipients = normalizeTo(req.to);
    if (!recipients.length) {
      return { id: '', status: 'failed', error: 'at least one recipient is required', to: [] };
    }
    if (!String(req.from || '').trim()) {
      return { id: '', status: 'failed', error: 'from is required', to: recipients };
    }
    if (!String(req.subject || '').trim()) {
      return { id: '', status: 'failed', error: 'subject is required', to: recipients };
    }
    if (!String(req.html || '').trim()) {
      return { id: '', status: 'failed', error: 'html is required', to: recipients };
    }

    // One logical send may exceed Resend's per-request `to` cap — fan out.
    if (recipients.length > RESEND_MAX_TO_PER_REQUEST) {
      const ids: string[] = [];
      const errors: string[] = [];
      for (let i = 0; i < recipients.length; i += RESEND_MAX_TO_PER_REQUEST) {
        const chunk = recipients.slice(i, i + RESEND_MAX_TO_PER_REQUEST);
        const part = await this.sendOne(apiKey, req, chunk);
        if (part.status === 'failed') errors.push(part.error || 'send failed');
        else if (part.id) ids.push(part.id);
      }
      if (!ids.length) {
        return {
          id: '',
          status: 'failed',
          error: errors[0] || 'all chunks failed',
          to: recipients,
        };
      }
      return {
        id: ids.join(','),
        status: errors.length ? 'queued' : 'sent',
        error: errors.length ? errors.slice(0, 3).join('; ') : undefined,
        to: recipients,
      };
    }

    return this.sendOne(apiKey, req, recipients);
  }

  private async sendOne(
    apiKey: string,
    req: EmailSendRequest,
    to: string[]
  ): Promise<EmailSendResult> {
    try {
      const res = await resendFetch('/emails', {
        apiKey,
        method: 'POST',
        body: JSON.stringify(buildPayload(req, to)),
      });
      const data = (await res.json().catch(() => ({}))) as {
        id?: string;
        message?: string;
        name?: string;
      };
      if (!res.ok) {
        return {
          id: '',
          status: 'failed',
          error: data.message || data.name || `Resend HTTP ${res.status}`,
          to,
        };
      }
      return {
        id: String(data.id || ''),
        status: 'sent',
        to,
      };
    } catch (e) {
      return {
        id: '',
        status: 'failed',
        error: e instanceof Error ? e.message : 'Resend request failed',
        to,
      };
    }
  }
}

let singleton: ResendEmailProvider | null = null;

export function getResendProvider(): ResendEmailProvider {
  if (!singleton) singleton = new ResendEmailProvider();
  return singleton;
}

export function isResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}
