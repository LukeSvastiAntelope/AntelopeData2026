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

/** Self-throttle between batch chunks (~10 req/s team limit → ≥110ms). */
const BATCH_CHUNK_SPACING_MS = 110;

/** Max 429 retries per chunk before failing that chunk. */
const BATCH_429_MAX_TRIES = 5;

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
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

/**
 * Parse Retry-After (seconds) or ratelimit-reset (unix seconds / delta).
 * Caps wait at 30s.
 */
function retryWaitMs(res: Response, attempt: number, backoffMs: number): number {
  const retryAfter = res.headers.get('retry-after');
  if (retryAfter) {
    const secs = Number(retryAfter);
    if (Number.isFinite(secs) && secs >= 0) {
      return Math.min(Math.max(secs * 1000, 100), 30_000);
    }
  }
  const reset = res.headers.get('ratelimit-reset');
  if (reset) {
    const n = Number(reset);
    if (Number.isFinite(n) && n > 0) {
      // Absolute unix timestamp vs relative seconds
      const wait =
        n > 1_000_000_000 ? Math.max(0, n * 1000 - Date.now()) : n * 1000;
      if (wait > 0) return Math.min(wait, 30_000);
    }
  }
  // Exponential backoff: 1s → 2s → 4s … cap 30s
  void attempt;
  return Math.min(backoffMs, 30_000);
}

function failedResults(
  messages: EmailSendRequest[],
  error: string
): EmailSendResult[] {
  return messages.map((m) => ({
    id: '',
    status: 'failed' as const,
    error,
    to: normalizeTo(m.to),
  }));
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

  /**
   * POST /emails/batch — up to RESEND_MAX_BATCH distinct messages per request.
   * Chunks larger inputs; retries 429 with Retry-After / exponential backoff.
   * Results align 1:1 with input order.
   */
  async sendBatch(messages: EmailSendRequest[]): Promise<EmailSendResult[]> {
    if (!messages.length) return [];
    const apiKey = requireApiKey();
    const out: EmailSendResult[] = [];

    for (let i = 0; i < messages.length; i += RESEND_MAX_BATCH) {
      const chunk = messages.slice(i, i + RESEND_MAX_BATCH);
      const chunkResults = await this.sendBatchChunk(apiKey, chunk);
      out.push(...chunkResults);

      // Self-throttle between chunks (not after the last)
      if (i + RESEND_MAX_BATCH < messages.length) {
        await sleep(BATCH_CHUNK_SPACING_MS);
      }
    }

    return out;
  }

  private async sendBatchChunk(
    apiKey: string,
    chunk: EmailSendRequest[]
  ): Promise<EmailSendResult[]> {
    const payloads = chunk.map((req) => {
      const to = normalizeTo(req.to);
      return buildPayload(req, to.length ? to : req.to);
    });

    let backoffMs = 1000;
    for (let attempt = 1; attempt <= BATCH_429_MAX_TRIES; attempt++) {
      let res: Response;
      try {
        res = await resendFetch('/emails/batch', {
          apiKey,
          method: 'POST',
          body: JSON.stringify(payloads),
        });
      } catch (e) {
        return failedResults(
          chunk,
          e instanceof Error ? e.message : 'Resend batch request failed'
        );
      }

      if (res.status === 429) {
        if (attempt >= BATCH_429_MAX_TRIES) {
          return failedResults(chunk, 'rate limited (max retries exceeded)');
        }
        const wait = retryWaitMs(res, attempt, backoffMs);
        await sleep(wait);
        backoffMs = Math.min(backoffMs * 2, 30_000);
        continue;
      }

      const body = (await res.json().catch(() => ({}))) as {
        data?: Array<{ id?: string } | null>;
        message?: string;
        name?: string;
      };

      if (!res.ok) {
        return failedResults(
          chunk,
          body.message || body.name || `Resend batch HTTP ${res.status}`
        );
      }

      const data = Array.isArray(body.data) ? body.data : [];
      const results: EmailSendResult[] = chunk.map((req, idx) => {
        const entry = data[idx];
        const id = entry && entry.id ? String(entry.id) : '';
        const to = normalizeTo(req.to);
        if (!id) {
          return {
            id: '',
            status: 'failed' as const,
            error: 'batch entry missing id',
            to,
          };
        }
        return { id, status: 'sent' as const, to };
      });

      // If Resend is near the limit, pause before the next chunk caller continues
      const remaining = Number(res.headers.get('ratelimit-remaining'));
      if (Number.isFinite(remaining) && remaining <= 1) {
        await sleep(1000);
      }

      return results;
    }

    // Unreachable — loop returns on success or max tries
    return failedResults(chunk, 'rate limited (max retries exceeded)');
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
