/**
 * Shared Twilio messaging helper for SMS + WhatsApp.
 *
 * Supports two auth modes (API key preferred, auth token fallback):
 *  - API Key:   TWILIO_API_KEY_SID (SK...) + TWILIO_API_KEY_SECRET + TWILIO_ACCOUNT_SID (AC...)
 *  - Auth Token: TWILIO_ACCOUNT_SID (AC...) + TWILIO_AUTH_TOKEN
 *
 * Senders:
 *  - SMS:      TWILIO_PHONE_NUMBER (e.g. +14155551234)  — or a Messaging Service SID via TWILIO_MESSAGING_SERVICE_SID
 *  - WhatsApp: TWILIO_WHATSAPP_FROM (e.g. whatsapp:+14155238886 — Twilio sandbox default)
 */

export type MessagingChannel = 'sms' | 'whatsapp';

export interface TwilioStatus {
  /** Auth credentials present (can construct a client). */
  authConfigured: boolean;
  /** A usable SMS sender (number or messaging service) is set. */
  smsConfigured: boolean;
  /** A usable WhatsApp sender is set. */
  whatsappConfigured: boolean;
  smsFrom: string | null;
  whatsappFrom: string | null;
  messagingServiceSid: string | null;
}

export function getTwilioStatus(): TwilioStatus {
  const accountSid = process.env.TWILIO_ACCOUNT_SID || '';
  const apiKeySid = process.env.TWILIO_API_KEY_SID || '';
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET || '';
  const authToken = process.env.TWILIO_AUTH_TOKEN || '';
  const smsFrom = process.env.TWILIO_PHONE_NUMBER || '';
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID || '';
  const whatsappFrom = process.env.TWILIO_WHATSAPP_FROM || '';

  const apiKeyAuth = !!(accountSid && apiKeySid && apiKeySecret);
  const tokenAuth = !!(accountSid && authToken);

  return {
    authConfigured: apiKeyAuth || tokenAuth,
    smsConfigured: (apiKeyAuth || tokenAuth) && !!(smsFrom || messagingServiceSid),
    whatsappConfigured: (apiKeyAuth || tokenAuth) && !!whatsappFrom,
    smsFrom: smsFrom || null,
    whatsappFrom: whatsappFrom || null,
    messagingServiceSid: messagingServiceSid || null,
  };
}

/** Build a Twilio client, preferring API-key auth. Returns null if not configured / SDK missing. */
export async function getTwilioClient(): Promise<any | null> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID || '';
  const apiKeySid = process.env.TWILIO_API_KEY_SID || '';
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET || '';
  const authToken = process.env.TWILIO_AUTH_TOKEN || '';

  let twilio: any;
  try {
    twilio = (await import('twilio')).default;
  } catch {
    return null;
  }

  // API-key auth: twilio(apiKeySid, apiKeySecret, { accountSid })
  if (accountSid && apiKeySid && apiKeySecret) {
    return twilio(apiKeySid, apiKeySecret, { accountSid });
  }
  // Auth-token auth: twilio(accountSid, authToken)
  if (accountSid && authToken) {
    return twilio(accountSid, authToken);
  }
  return null;
}

/**
 * Normalize a phone number to E.164-ish (+digits). Strips spaces, dashes,
 * parens, leading "00". Does NOT guess a country code — callers should include it.
 * For WhatsApp, the "whatsapp:" prefix is added by sendMessages, not here.
 */
export function normalizePhone(raw: string): string {
  let n = String(raw || '').trim();
  if (!n) return '';
  // Strip an existing whatsapp: prefix if present
  n = n.replace(/^whatsapp:/i, '').trim();
  // Keep a leading +, drop everything non-digit
  const hasPlus = n.startsWith('+');
  let digits = n.replace(/[^\d]/g, '');
  // International "00" prefix -> "+"
  if (!hasPlus && digits.startsWith('00')) {
    digits = digits.slice(2);
    return `+${digits}`;
  }
  if (hasPlus) return `+${digits}`;
  // No plus and not 00 — assume the caller included a country code; prefix +
  return digits ? `+${digits}` : '';
}

export interface SendResult {
  phone: string;
  status: 'sent' | 'failed';
  sid?: string;
  error?: string;
}

export interface SendSummary {
  total: number;
  sent: number;
  failed: number;
}

/**
 * Send a message to many recipients on the given channel. Batches of 10 in parallel.
 * Throws if not configured (callers should check getTwilioStatus first for a clean message).
 */
export async function sendMessages(opts: {
  channel: MessagingChannel;
  to: string[];
  body: string;
  mediaUrl?: string[];
}): Promise<{ results: SendResult[]; summary: SendSummary }> {
  const { channel, to, body, mediaUrl } = opts;
  const client = await getTwilioClient();
  if (!client) throw new Error('Twilio is not configured');

  const status = getTwilioStatus();
  const messagingServiceSid = status.messagingServiceSid;

  // Resolve the "from" sender for the channel.
  let from: string | undefined;
  if (channel === 'whatsapp') {
    if (!status.whatsappFrom) throw new Error('No WhatsApp sender configured (set TWILIO_WHATSAPP_FROM)');
    from = status.whatsappFrom.startsWith('whatsapp:')
      ? status.whatsappFrom
      : `whatsapp:${status.whatsappFrom}`;
  } else {
    if (!status.smsFrom && !messagingServiceSid) {
      throw new Error('No SMS sender configured (set TWILIO_PHONE_NUMBER or TWILIO_MESSAGING_SERVICE_SID)');
    }
    from = status.smsFrom || undefined;
  }

  const toAddr = (phone: string) => {
    const norm = normalizePhone(phone);
    return channel === 'whatsapp' ? `whatsapp:${norm}` : norm;
  };

  const results: SendResult[] = [];
  const batchSize = 10;
  for (let i = 0; i < to.length; i += batchSize) {
    const batch = to.slice(i, i + batchSize);
    const settled = await Promise.allSettled(
      batch.map(async (phone) => {
        const payload: any = { body, to: toAddr(phone) };
        // Messaging Service is only for plain SMS; WhatsApp/single number use `from`.
        if (channel === 'sms' && messagingServiceSid && !status.smsFrom) {
          payload.messagingServiceSid = messagingServiceSid;
        } else {
          payload.from = from;
        }
        if (mediaUrl?.length) payload.mediaUrl = mediaUrl;
        const msg = await client.messages.create(payload);
        return { phone, status: 'sent' as const, sid: msg.sid };
      })
    );
    settled.forEach((r, idx) => {
      if (r.status === 'fulfilled') results.push(r.value);
      else
        results.push({
          phone: batch[idx],
          status: 'failed',
          error: r.reason?.message || 'Unknown error',
        });
    });
  }

  const sent = results.filter((r) => r.status === 'sent').length;
  const failed = results.filter((r) => r.status === 'failed').length;
  return { results, summary: { total: to.length, sent, failed } };
}
