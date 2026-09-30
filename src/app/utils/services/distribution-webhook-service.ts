/**
 * Signed outbound delivery to campaign Zapier/Make Catch Hooks.
 * Failures are logged and never throw through to undo an approval.
 */

import { createHmac, timingSafeEqual } from 'crypto';
import dns from 'dns/promises';
import {
  DistributionWebhookRepo,
  type DistributionContentType,
  type DistributionWebhookRow,
} from '@/app/utils/database/distribution-webhook-repo';

export type DistributionWebhookPayload = {
  event: 'content.approved' | 'webhook.test';
  content_type: DistributionContentType;
  organization_id: number;
  caption?: string | null;
  /** Separate AI disclosure field so Zaps cannot silently drop it from caption. */
  ai_disclosure?: string | null;
  media_url?: string | null;
  platform?: string | null;
  staged_action_id?: number | null;
  metadata?: Record<string, unknown>;
  sent_at: string;
};

export type DistributionDeliveryResult = {
  webhookId: number;
  label: string;
  ok: boolean;
  statusCode?: number;
  error?: string;
};

const FETCH_TIMEOUT_MS = 10_000;

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '[::1]',
  '::1',
  'metadata.google.internal',
]);

const PRIVATE_HOSTNAME_SUFFIXES = [
  '.local',
  '.localhost',
  '.internal',
  '.intranet',
  '.lan',
];

const PRIVATE_IPV4_RANGES = [
  /^10\./,
  /^127\./,
  /^0\./,
  /^169\.254\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^100\.(6[4-9]|[7-9][0-9]|1[0-2][0-9])\./, // CGNAT
];

function isPrivateIpv4(ip: string): boolean {
  return PRIVATE_IPV4_RANGES.some((re) => re.test(ip));
}

function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1') return true;
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // ULA
  if (lower.startsWith('fe80')) return true; // link-local
  return false;
}

function isBlockedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(lower)) return true;
  if (PRIVATE_HOSTNAME_SUFFIXES.some((s) => lower.endsWith(s))) return true;
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(lower) && isPrivateIpv4(lower)) {
    return true;
  }
  return false;
}

/**
 * https-only + block private/internal hosts and resolved IPs (SSRF guard).
 */
export async function assertSafeHttpsWebhookUrl(
  raw: string
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(String(raw || '').trim());
  } catch {
    throw new Error('Invalid webhook URL');
  }
  if (url.protocol !== 'https:') {
    throw new Error('Webhook URL must use https://');
  }
  if (url.username || url.password) {
    throw new Error('Webhook URL must not include credentials');
  }
  const host = url.hostname;
  if (!host || isBlockedHostname(host)) {
    throw new Error('Webhook URL host is not allowed');
  }

  try {
    const addrs = await dns.lookup(host, { all: true, verbatim: true });
    if (!addrs.length) {
      throw new Error('Webhook URL host could not be resolved');
    }
    for (const a of addrs) {
      if (a.family === 4 && isPrivateIpv4(a.address)) {
        throw new Error('Webhook URL resolves to a private IP');
      }
      if (a.family === 6 && isPrivateIpv6(a.address)) {
        throw new Error('Webhook URL resolves to a private IP');
      }
    }
  } catch (err) {
    if (
      err instanceof Error &&
      (err.message.includes('private') ||
        err.message.includes('not allowed') ||
        err.message.includes('could not be resolved'))
    ) {
      throw err;
    }
    throw new Error(
      `Webhook URL host could not be verified: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }

  return url;
}

export function signDistributionPayload(
  secret: string,
  timestamp: string,
  body: string
): string {
  const mac = createHmac('sha256', secret)
    .update(`${timestamp}.${body}`)
    .digest('hex');
  return `sha256=${mac}`;
}

/** Optional verifier for tests / docs — constant-time compare. */
export function verifyDistributionSignature(params: {
  secret: string;
  timestamp: string;
  body: string;
  signatureHeader: string;
  maxSkewMs?: number;
}): boolean {
  const maxSkew = params.maxSkewMs ?? 5 * 60 * 1000;
  const ts = Number(params.timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > maxSkew) {
    return false;
  }
  const expected = signDistributionPayload(
    params.secret,
    params.timestamp,
    params.body
  );
  const got = String(params.signatureHeader || '');
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(got);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

async function postOnce(
  webhook: DistributionWebhookRow,
  payload: DistributionWebhookPayload
): Promise<DistributionDeliveryResult> {
  const body = JSON.stringify(payload);
  const timestamp = String(Date.now());
  const signature = signDistributionPayload(
    webhook.secret,
    timestamp,
    body
  );

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    await assertSafeHttpsWebhookUrl(webhook.url);
    const res = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'AntelopeDistribution/1.0',
        'X-Antelope-Signature': signature,
        'X-Antelope-Timestamp': timestamp,
        'X-Antelope-Event': payload.event,
      },
      body,
      signal: controller.signal,
      redirect: 'error',
    });

    const ok = res.status >= 200 && res.status < 300;
    await DistributionWebhookRepo.markDelivery(
      webhook.organizationId,
      webhook.id,
      ok
    ).catch(() => {});

    if (!ok) {
      const text = await res.text().catch(() => '');
      console.warn(
        `[distribution-webhook] delivery failed id=${webhook.id} status=${res.status}`,
        text.slice(0, 200)
      );
      return {
        webhookId: webhook.id,
        label: webhook.label,
        ok: false,
        statusCode: res.status,
        error: `HTTP ${res.status}`,
      };
    }

    console.log(
      `[distribution-webhook] delivered id=${webhook.id} event=${payload.event}`
    );
    return {
      webhookId: webhook.id,
      label: webhook.label,
      ok: true,
      statusCode: res.status,
    };
  } catch (err) {
    await DistributionWebhookRepo.markDelivery(
      webhook.organizationId,
      webhook.id,
      false
    ).catch(() => {});
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `[distribution-webhook] delivery error id=${webhook.id}`,
      message
    );
    return {
      webhookId: webhook.id,
      label: webhook.label,
      ok: false,
      error: message,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * POST JSON to every enabled destination for this org + content type.
 * Never throws — callers (approve path) must not undo approval on failure.
 */
export async function sendDistributionWebhook(
  organizationId: number,
  payload: Omit<DistributionWebhookPayload, 'organization_id' | 'sent_at'> & {
    organization_id?: number;
    sent_at?: string;
  }
): Promise<DistributionDeliveryResult[]> {
  const contentType = payload.content_type;
  const full: DistributionWebhookPayload = {
    ...payload,
    organization_id: organizationId,
    sent_at: payload.sent_at || new Date().toISOString(),
  };

  let destinations: DistributionWebhookRow[] = [];
  try {
    destinations = await DistributionWebhookRepo.listEnabledForContent(
      organizationId,
      contentType
    );
  } catch (err) {
    console.warn(
      '[distribution-webhook] list failed',
      err instanceof Error ? err.message : err
    );
    return [];
  }

  if (!destinations.length) return [];

  const results: DistributionDeliveryResult[] = [];
  for (const dest of destinations) {
    results.push(await postOnce(dest, full));
  }
  return results;
}

/** Fire a single destination (test send). Throws on validation errors. */
export async function sendTestDistributionWebhook(
  organizationId: number,
  webhookId: number
): Promise<DistributionDeliveryResult> {
  const webhook = await DistributionWebhookRepo.getById(
    organizationId,
    webhookId
  );
  if (!webhook) {
    throw new Error('Webhook destination not found');
  }

  await assertSafeHttpsWebhookUrl(webhook.url);

  const contentType = webhook.contentTypes[0] || 'video';
  const payload: DistributionWebhookPayload = {
    event: 'webhook.test',
    content_type: contentType,
    organization_id: organizationId,
    caption:
      'Antelope test send — if you see this in Zapier/Make, the Catch Hook is connected.',
    ai_disclosure:
      contentType === 'video'
        ? 'This content was generated or assisted by AI.'
        : null,
    media_url:
      contentType === 'video'
        ? 'https://www.antelopedata.org/og-image.png'
        : null,
    platform: 'test',
    staged_action_id: null,
    metadata: { test: true, source: 'channels.publishing.send_test' },
    sent_at: new Date().toISOString(),
  };

  return postOnce(webhook, payload);
}
