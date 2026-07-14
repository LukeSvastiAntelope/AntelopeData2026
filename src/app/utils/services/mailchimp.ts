import crypto from 'crypto';
import { openSql } from '@/app/utils/database/db';

/**
 * Mailchimp Marketing API integration (mass email to share surveys).
 *
 * Per-user credentials are stored in `user_channel_integrations`
 * (provider = 'email', encrypted_credentials.provider = 'mailchimp'), matching
 * the existing SMS/Twilio pattern. No SDK dependency — Mailchimp's Marketing
 * API is plain REST with HTTP Basic auth (any username, API key as password).
 *
 * Flow to send a "campaign" to an ad-hoc list of emails (this is the only way
 * to send bulk email through the standard Marketing API — there's no raw
 * "send to arbitrary address" endpoint, unlike Twilio SMS):
 *   1. Resolve the audience (list) to use.
 *   2. Upsert each recipient as a list member (required before segmenting).
 *   3. Create a static segment containing exactly those recipients.
 *   4. Create a regular campaign targeted at that segment, set its content,
 *      and send it. Mailchimp appends the required unsubscribe/compliance
 *      footer automatically.
 */

export interface MailchimpCreds {
  apiKey: string;
  serverPrefix: string;
  fromEmail: string;
  fromName: string;
  listId?: string | null;
}

/** Server prefix is always the suffix after the last "-" in a Mailchimp API key (e.g. abc123...-us14). */
export function serverPrefixFromApiKey(apiKey: string): string | null {
  const m = String(apiKey || '').trim().match(/-([a-z]+\d+)$/i);
  return m ? m[1] : null;
}

export async function getMailchimpCreds(userId: string | number): Promise<MailchimpCreds | null> {
  const db = await openSql();
  const [rows]: any = await db.execute(
    `SELECT status, encrypted_credentials FROM user_channel_integrations
     WHERE user_id = ? AND provider = 'email' AND status = 'connected'
     ORDER BY updated_at DESC LIMIT 1`,
    [userId]
  );
  const row = rows?.[0];
  if (!row) return null;
  const creds = typeof row.encrypted_credentials === 'string' ? JSON.parse(row.encrypted_credentials) : row.encrypted_credentials;
  if (!creds || creds.provider !== 'mailchimp' || !creds.apiKey || !creds.serverPrefix) return null;
  return {
    apiKey: creds.apiKey,
    serverPrefix: creds.serverPrefix,
    fromEmail: creds.fromEmail || '',
    fromName: creds.fromName || 'Antelope',
    listId: creds.listId || null,
  };
}

function baseUrl(serverPrefix: string) {
  return `https://${serverPrefix}.api.mailchimp.com/3.0`;
}

async function mcFetch(creds: MailchimpCreds, path: string, init?: RequestInit) {
  const auth = Buffer.from(`anystring:${creds.apiKey}`).toString('base64');
  const res = await fetch(`${baseUrl(creds.serverPrefix)}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${auth}`,
      ...(init?.headers || {}),
    },
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  if (!res.ok) {
    const detail = json?.detail || json?.title || text || res.statusText;
    throw new Error(`Mailchimp API error (${res.status}): ${detail}`);
  }
  return json;
}

/** Verify credentials work by pinging the account root. */
export async function verifyMailchimpCreds(creds: MailchimpCreds): Promise<{ ok: boolean; accountName?: string; error?: string }> {
  try {
    const data = await mcFetch(creds, '/');
    return { ok: true, accountName: data?.account_name };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Verification failed' };
  }
}

/** Resolve the audience/list to use: explicit listId, else the account's first (usually only) audience. */
async function resolveListId(creds: MailchimpCreds): Promise<string> {
  if (creds.listId) return creds.listId;
  const data = await mcFetch(creds, '/lists?count=1');
  const list = data?.lists?.[0];
  if (!list?.id) {
    throw new Error('No Mailchimp audience found. Create an Audience in Mailchimp (Audience → Create Audience) first.');
  }
  return list.id;
}

function subscriberHash(email: string): string {
  return crypto.createHash('md5').update(email.trim().toLowerCase()).digest('hex');
}

export interface EmailSendResult {
  email: string;
  status: 'added' | 'failed';
  error?: string;
}

export interface CampaignSendSummary {
  total: number;
  added: number;
  failed: number;
}

/**
 * Send a survey-invite email blast to a list of addresses via a Mailchimp
 * campaign. Returns the campaign id and per-recipient upsert results (actual
 * delivery is queued/async on Mailchimp's side, same as any campaign send).
 */
export async function sendSurveyEmailCampaign(opts: {
  creds: MailchimpCreds;
  emails: string[];
  subject: string;
  html: string;
  campaignTitle: string;
}): Promise<{ campaignId: string; summary: CampaignSendSummary; results: EmailSendResult[] }> {
  const { creds, emails, subject, html, campaignTitle } = opts;
  const listId = await resolveListId(creds);

  // 1) Upsert each recipient into the audience (required before they can be segmented/sent to).
  const results: EmailSendResult[] = [];
  const batchSize = 10;
  for (let i = 0; i < emails.length; i += batchSize) {
    const batch = emails.slice(i, i + batchSize);
    const settled = await Promise.allSettled(
      batch.map(async (email) => {
        const hash = subscriberHash(email);
        await mcFetch(creds, `/lists/${listId}/members/${hash}`, {
          method: 'PUT',
          body: JSON.stringify({
            email_address: email,
            status_if_new: 'subscribed',
            tags: ['antelope-survey-invite'],
          }),
        });
        return email;
      })
    );
    settled.forEach((r, idx) => {
      if (r.status === 'fulfilled') results.push({ email: batch[idx], status: 'added' });
      else results.push({ email: batch[idx], status: 'failed', error: r.reason?.message || 'Unknown error' });
    });
  }

  const addedEmails = results.filter((r) => r.status === 'added').map((r) => r.email);
  if (addedEmails.length === 0) {
    throw new Error('No recipients could be added to the Mailchimp audience.');
  }

  // 2) Create a static segment containing exactly the recipients we just added.
  const segment = await mcFetch(creds, `/lists/${listId}/segments`, {
    method: 'POST',
    body: JSON.stringify({
      name: `${campaignTitle} — ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
      static_segment: addedEmails,
    }),
  });

  // 3) Create the campaign targeted at that segment.
  const campaign = await mcFetch(creds, '/campaigns', {
    method: 'POST',
    body: JSON.stringify({
      type: 'regular',
      recipients: { list_id: listId, segment_opts: { saved_segment_id: segment.id } },
      settings: {
        subject_line: subject,
        title: campaignTitle,
        from_name: creds.fromName,
        reply_to: creds.fromEmail,
      },
    }),
  });

  // 4) Set content and send.
  await mcFetch(creds, `/campaigns/${campaign.id}/content`, {
    method: 'PUT',
    body: JSON.stringify({ html }),
  });
  await mcFetch(creds, `/campaigns/${campaign.id}/actions/send`, { method: 'POST' });

  return {
    campaignId: campaign.id,
    summary: {
      total: emails.length,
      added: addedEmails.length,
      failed: results.filter((r) => r.status === 'failed').length,
    },
    results,
  };
}
