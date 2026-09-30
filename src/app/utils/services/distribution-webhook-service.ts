/**
 * Signed outbound delivery to campaign Zapier/Make Catch Hooks.
 * W2: queue on approval, log attempts, retry with backoff. Failures never
 * undo an approval.
 */

import { createHmac, timingSafeEqual } from 'crypto';
import dns from 'dns/promises';
import {
  DistributionWebhookRepo,
  type DistributionContentType,
  type DistributionWebhookRow,
} from '@/app/utils/database/distribution-webhook-repo';
import {
  DistributionDeliveryRepo,
  type DistributionDeliveryRow,
} from '@/app/utils/database/distribution-delivery-repo';
import { resolvePublicMediaUrl } from '@/app/utils/services/distribution-media-token';
import { AI_DISCLOSURE_DEFAULT } from '@/app/utils/services/video/guardrails';
import { openSql } from '@/app/utils/database/db';
import type { RowDataPacket } from 'mysql2/promise';
import type {
  ConsultantStagedAction,
} from '@/app/utils/database/consultant-repo';
import type { ToolExecutionResult } from '@/app/utils/services/tools/types';

/** Stable Zapier/Make payload (documented). */
export type ApprovedContentPayload = {
  event: 'content.approved';
  id: string;
  organization: { id: number; name: string | null };
  content_type: DistributionContentType;
  platform_hint: string | null;
  caption: string | null;
  hashtags?: string[];
  ai_disclosure?: string | null;
  media_url: string | null;
  media_expires_at?: string | null;
  thumbnail_url?: string | null;
  approved_by: { user_id: number; email?: string | null };
  approved_at: string;
};

export type TestWebhookPayload = {
  event: 'webhook.test';
  id: string;
  organization: { id: number; name: string | null };
  content_type: DistributionContentType;
  platform_hint: string | null;
  caption: string | null;
  ai_disclosure?: string | null;
  media_url: string | null;
  media_expires_at?: string | null;
  thumbnail_url?: string | null;
  approved_by: { user_id: number; email?: string | null };
  approved_at: string;
  metadata?: Record<string, unknown>;
};

export type DistributionWebhookPayload =
  | ApprovedContentPayload
  | TestWebhookPayload;

export type DistributionDeliveryResult = {
  webhookId: number;
  label: string;
  ok: boolean;
  statusCode?: number;
  error?: string;
  deliveryId?: number;
};

export type DistributionQueueSummary = {
  queued: boolean;
  contentType: DistributionContentType | null;
  deliveryIds: number[];
  status: 'none' | 'queued' | 'sent' | 'failed' | 'partial';
  label: string;
};

const FETCH_TIMEOUT_MS = 10_000;

/** Backoff after failed attempts 1→2, 2→3, 3→exhausted: 1m / 10m / 1h */
export const DISTRIBUTION_RETRY_BACKOFF_MS = [
  60_000,
  10 * 60_000,
  60 * 60_000,
] as const;

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
  /^100\.(6[4-9]|[7-9][0-9]|1[0-2][0-9])\./,
];

function isPrivateIpv4(ip: string): boolean {
  return PRIVATE_IPV4_RANGES.some((re) => re.test(ip));
}

function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1') return true;
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
  if (lower.startsWith('fe80')) return true;
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
  payload: DistributionWebhookPayload | Record<string, unknown>
): Promise<DistributionDeliveryResult> {
  const body = JSON.stringify(payload);
  const timestamp = String(Date.now());
  const signature = signDistributionPayload(
    webhook.secret,
    timestamp,
    body
  );
  const event =
    typeof (payload as any)?.event === 'string'
      ? String((payload as any).event)
      : 'content.approved';

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
        'X-Antelope-Event': event,
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
      `[distribution-webhook] delivered id=${webhook.id} event=${event}`
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

function nextBackoffDate(attemptAfterIncrement: number): Date | null {
  // attemptAfterIncrement is 1,2,3… → backoff index 0,1,2
  const idx = attemptAfterIncrement - 1;
  if (idx < 0 || idx >= DISTRIBUTION_RETRY_BACKOFF_MS.length) return null;
  return new Date(Date.now() + DISTRIBUTION_RETRY_BACKOFF_MS[idx]);
}

async function processDeliveryRow(
  row: DistributionDeliveryRow
): Promise<DistributionDeliveryResult> {
  const webhook = await DistributionWebhookRepo.getById(
    row.organizationId,
    row.webhookId
  );
  if (!webhook) {
    await DistributionDeliveryRepo.markAttempt({
      id: row.id,
      ok: false,
      error: 'Webhook destination missing',
      exhausted: true,
      nextAttemptAt: null,
    });
    return {
      webhookId: row.webhookId,
      label: 'missing',
      ok: false,
      error: 'Webhook destination missing',
      deliveryId: row.id,
    };
  }

  const payload = (row.payload || {}) as DistributionWebhookPayload;
  const result = await postOnce(webhook, payload);
  const nextAttempt = row.attempt + 1; // after this markAttempt increments

  if (result.ok) {
    await DistributionDeliveryRepo.markAttempt({
      id: row.id,
      ok: true,
      httpStatus: result.statusCode ?? null,
      error: null,
      nextAttemptAt: null,
    });
  } else {
    const exhausted = nextAttempt >= row.maxAttempts;
    const nextAt = exhausted ? null : nextBackoffDate(nextAttempt);
    await DistributionDeliveryRepo.markAttempt({
      id: row.id,
      ok: false,
      httpStatus: result.statusCode ?? null,
      error: result.error || 'Delivery failed',
      exhausted,
      nextAttemptAt: nextAt,
    });
  }

  return { ...result, deliveryId: row.id };
}

/**
 * Direct fire (legacy / tests) — prefer queueDistributionOnApproval in prod.
 */
export async function sendDistributionWebhook(
  organizationId: number,
  payload: DistributionWebhookPayload
): Promise<DistributionDeliveryResult[]> {
  let destinations: DistributionWebhookRow[] = [];
  try {
    destinations = await DistributionWebhookRepo.listEnabledForContent(
      organizationId,
      payload.content_type
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
    results.push(await postOnce(dest, payload));
  }
  return results;
}

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

  let orgName: string | null = null;
  try {
    const db = await openSql();
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT name FROM organizations WHERE id = ? LIMIT 1`,
      [organizationId]
    );
    orgName = rows[0]?.name != null ? String(rows[0].name) : null;
  } catch {
    /* ignore */
  }

  const contentType = webhook.contentTypes[0] || 'video';
  const now = new Date().toISOString();
  const payload: TestWebhookPayload = {
    event: 'webhook.test',
    id: `test-${webhookId}-${Date.now()}`,
    organization: { id: organizationId, name: orgName },
    content_type: contentType,
    platform_hint: 'test',
    caption:
      'Antelope test send — if you see this in Zapier/Make, the Catch Hook is connected.',
    ai_disclosure:
      contentType === 'video' ? AI_DISCLOSURE_DEFAULT : null,
    media_url:
      contentType === 'video'
        ? 'https://www.antelopedata.org/og-image.png'
        : null,
    media_expires_at: null,
    thumbnail_url: null,
    approved_by: { user_id: 0, email: null },
    approved_at: now,
    metadata: { test: true, source: 'channels.publishing.send_test' },
  };

  return postOnce(webhook, payload);
}

export type DistributableContent = {
  contentType: DistributionContentType;
  caption: string | null;
  hashtags: string[];
  platformHint: string | null;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  aiDisclosure: string | null;
};

/** Detect video / text social posts that should fan out to Zapier/Make. */
export function resolveDistributableContent(
  staged: ConsultantStagedAction,
  execution: ToolExecutionResult | null | undefined
): DistributableContent | null {
  const tool = String(staged.toolName || staged.payload?.tool || '');
  const input = (staged.payload?.input || {}) as Record<string, unknown>;
  const data =
    execution &&
    execution.ok &&
    'data' in execution &&
    execution.data &&
    typeof execution.data === 'object'
      ? (execution.data as Record<string, unknown>)
      : {};

  if (tool === 'generate_and_post_video') {
    const caption =
      (data.caption as string) ||
      (input.caption as string) ||
      null;
    const mediaUrl =
      (data.videoUrl as string) ||
      (data.localAssetUrl as string) ||
      (input.videoUrl as string) ||
      (staged.payload?.videoUrl as string) ||
      null;
    const includeDisclosure =
      Boolean(data.aiDisclosure) ||
      Boolean(input.includeAiDisclosure) ||
      Boolean(staged.payload?.includeAiDisclosure);
    const disclosureText =
      (input.aiDisclosureText as string) || AI_DISCLOSURE_DEFAULT;
    return {
      contentType: 'video',
      caption: caption ? String(caption) : null,
      hashtags: extractHashtags(String(caption || '')),
      platformHint:
        String(data.platform || input.platform || 'tiktok') || null,
      mediaUrl: mediaUrl ? String(mediaUrl) : null,
      thumbnailUrl: data.thumbnailUrl
        ? String(data.thumbnailUrl)
        : null,
      aiDisclosure: includeDisclosure ? disclosureText : null,
    };
  }

  if (tool === 'draft_posts') {
    const caption =
      (data.caption as string) ||
      (data.body as string) ||
      (input.caption as string) ||
      (input.body as string) ||
      null;
    return {
      contentType: 'text',
      caption: caption ? String(caption) : null,
      hashtags: extractHashtags(String(caption || '')),
      platformHint: String(data.platform || input.platform || '') || null,
      mediaUrl: data.mediaUrl ? String(data.mediaUrl) : null,
      thumbnailUrl: null,
      aiDisclosure: null,
    };
  }

  // Explicit payload flag for future text social cards
  if (
    staged.payload?.distributeAs === 'text' ||
    staged.payload?.contentType === 'text'
  ) {
    const caption =
      (staged.payload.caption as string) ||
      (input.caption as string) ||
      (input.body as string) ||
      null;
    return {
      contentType: 'text',
      caption: caption ? String(caption) : null,
      hashtags: extractHashtags(String(caption || '')),
      platformHint: String(staged.payload.platform || input.platform || '') || null,
      mediaUrl: staged.payload.mediaUrl
        ? String(staged.payload.mediaUrl)
        : null,
      thumbnailUrl: null,
      aiDisclosure: null,
    };
  }

  return null;
}

function extractHashtags(text: string): string[] {
  const tags = text.match(/#[\w]+/g) || [];
  return Array.from(new Set(tags.map((t) => t.slice(1))));
}

async function loadOrgName(organizationId: number): Promise<string | null> {
  try {
    const db = await openSql();
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT name FROM organizations WHERE id = ? LIMIT 1`,
      [organizationId]
    );
    return rows[0]?.name != null ? String(rows[0].name) : null;
  } catch {
    return null;
  }
}

async function loadUserEmail(userId: number): Promise<string | null> {
  try {
    const db = await openSql();
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT email FROM users WHERE id = ? LIMIT 1`,
      [userId]
    );
    return rows[0]?.email != null ? String(rows[0].email) : null;
  } catch {
    return null;
  }
}

export function summarizeDeliveries(
  rows: DistributionDeliveryRow[]
): DistributionQueueSummary {
  if (!rows.length) {
    return {
      queued: false,
      contentType: null,
      deliveryIds: [],
      status: 'none',
      label: '',
    };
  }
  const deliveryIds = rows.map((r) => r.id);
  const allSuccess = rows.every((r) => r.status === 'success');
  const anyFailed = rows.some(
    (r) => r.status === 'failed' || r.status === 'exhausted'
  );
  const anyPending = rows.some((r) => r.status === 'pending');
  let status: DistributionQueueSummary['status'] = 'queued';
  let label = 'Sending to Zapier…';
  if (allSuccess) {
    status = 'sent';
    label = 'Sent to Zapier ✓';
  } else if (anyFailed && !anyPending && !rows.some((r) => r.status === 'success')) {
    status = 'failed';
    label = 'Delivery failed — Retry';
  } else if (anyFailed && rows.some((r) => r.status === 'success')) {
    status = 'partial';
    label = 'Partial delivery — Retry failed';
  } else if (anyPending) {
    status = 'queued';
    label = 'Sending to Zapier…';
  }
  const contentType =
    (rows[0]?.payload?.content_type as DistributionContentType) || null;
  return {
    queued: true,
    contentType,
    deliveryIds,
    status,
    label,
  };
}

/**
 * Create delivery rows for matching destinations and kick off async first attempt.
 * Safe to call after approval — never throws to caller of approve.
 */
export async function queueDistributionOnApproval(params: {
  staged: ConsultantStagedAction;
  execution: ToolExecutionResult;
  userId: number;
  organizationId: number;
}): Promise<DistributionQueueSummary> {
  try {
    const content = resolveDistributableContent(
      params.staged,
      params.execution
    );
    if (!content) {
      return {
        queued: false,
        contentType: null,
        deliveryIds: [],
        status: 'none',
        label: '',
      };
    }

    const destinations =
      await DistributionWebhookRepo.listEnabledForContent(
        params.organizationId,
        content.contentType
      );
    if (!destinations.length) {
      return {
        queued: false,
        contentType: content.contentType,
        deliveryIds: [],
        status: 'none',
        label: '',
      };
    }

    const media = resolvePublicMediaUrl({
      mediaUrl: content.mediaUrl,
      userId: params.userId,
      organizationId: params.organizationId,
    });
    const thumb = content.thumbnailUrl
      ? resolvePublicMediaUrl({
          mediaUrl: content.thumbnailUrl,
          userId: params.userId,
          organizationId: params.organizationId,
        })
      : { mediaUrl: null, expiresAt: null };

    const [orgName, email] = await Promise.all([
      loadOrgName(params.organizationId),
      loadUserEmail(params.userId),
    ]);

    const payload: ApprovedContentPayload = {
      event: 'content.approved',
      id: `staged-${params.staged.id}`,
      organization: { id: params.organizationId, name: orgName },
      content_type: content.contentType,
      platform_hint: content.platformHint,
      caption: content.caption,
      hashtags: content.hashtags,
      ai_disclosure: content.aiDisclosure,
      media_url: media.mediaUrl,
      media_expires_at: media.expiresAt,
      thumbnail_url: thumb.mediaUrl,
      approved_by: { user_id: params.userId, email },
      approved_at: new Date().toISOString(),
    };

    const deliveryIds: number[] = [];
    for (const dest of destinations) {
      const row = await DistributionDeliveryRepo.create({
        stagedActionId: params.staged.id,
        webhookId: dest.id,
        organizationId: params.organizationId,
        payload: payload as unknown as Record<string, unknown>,
        nextAttemptAt: new Date(), // due immediately
      });
      deliveryIds.push(row.id);
    }

    // Fire first attempts without blocking the approval response
    void processDueDeliveries({
      stagedActionId: params.staged.id,
      limit: deliveryIds.length,
    }).catch((err) =>
      console.warn(
        '[distribution-webhook] async first attempt failed',
        err instanceof Error ? err.message : err
      )
    );

    return {
      queued: true,
      contentType: content.contentType,
      deliveryIds,
      status: 'queued',
      label: 'Sending to Zapier…',
    };
  } catch (err) {
    console.warn(
      '[distribution-webhook] queue on approval failed',
      err instanceof Error ? err.message : err
    );
    return {
      queued: false,
      contentType: null,
      deliveryIds: [],
      status: 'none',
      label: '',
    };
  }
}

/** Process due delivery rows (cron + post-approve kick). */
export async function processDueDeliveries(opts?: {
  stagedActionId?: number;
  limit?: number;
}): Promise<{ processed: number; succeeded: number; failed: number }> {
  let rows = await DistributionDeliveryRepo.listDue(opts?.limit ?? 50);
  if (opts?.stagedActionId) {
    rows = rows.filter((r) => r.stagedActionId === opts.stagedActionId);
  }
  let succeeded = 0;
  let failed = 0;
  for (const row of rows) {
    const result = await processDeliveryRow(row);
    if (result.ok) succeeded++;
    else failed++;
  }
  return { processed: rows.length, succeeded, failed };
}

export async function getDistributionStatusForStaged(
  stagedActionId: number
): Promise<DistributionQueueSummary & { deliveries: DistributionDeliveryRow[] }> {
  const deliveries =
    await DistributionDeliveryRepo.listByStagedAction(stagedActionId);
  return { ...summarizeDeliveries(deliveries), deliveries };
}

export async function manualRetryDelivery(params: {
  stagedActionId: number;
  organizationId: number;
  deliveryId?: number;
}): Promise<DistributionQueueSummary> {
  const rows = await DistributionDeliveryRepo.listByStagedAction(
    params.stagedActionId
  );
  const targets = rows.filter((r) => {
    if (r.organizationId !== params.organizationId) return false;
    if (params.deliveryId != null) return r.id === params.deliveryId;
    return r.status === 'failed' || r.status === 'exhausted';
  });

  for (const row of targets) {
    await DistributionDeliveryRepo.resetForManualRetry(row.id);
  }

  await processDueDeliveries({
    stagedActionId: params.stagedActionId,
    limit: Math.max(10, targets.length),
  });

  return getDistributionStatusForStaged(params.stagedActionId);
}
