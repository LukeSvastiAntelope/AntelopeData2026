/**
 * Platform Zapier/Make delivery for Antelope own-growth drafts.
 * Separate from campaign distribution — super-admin destinations only.
 */

import {
  assertSafeHttpsWebhookUrl,
  signDistributionPayload,
  DISTRIBUTION_RETRY_BACKOFF_MS,
  DISTRIBUTION_FAILED_LABEL,
  DISTRIBUTION_PARTIAL_LABEL,
  scheduleDistributionWork,
  type ApprovedContentPayload,
  type DistributionDeliveryResult,
  type DistributionQueueSummary,
} from '@/app/utils/services/distribution-webhook-service';
import {
  PlatformDistributionWebhookRepo,
  type PlatformWebhookRow,
} from '@/app/utils/database/platform-distribution-webhook-repo';
import {
  PlatformDistributionDeliveryRepo,
  type PlatformDeliveryRow,
} from '@/app/utils/database/platform-distribution-delivery-repo';
import type { MarketingDraft } from '@/app/utils/database/antelope-growth-repo';

const FETCH_TIMEOUT_MS = 10_000;

async function postPlatformOnce(
  webhook: PlatformWebhookRow,
  payload: Record<string, unknown>
): Promise<DistributionDeliveryResult> {
  const body = JSON.stringify(payload);
  const timestamp = String(Date.now());
  const signature = signDistributionPayload(
    webhook.secret,
    timestamp,
    body
  );
  const event = String(payload.event || 'content.approved');

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
        'X-Antelope-Scope': 'platform',
      },
      body,
      signal: controller.signal,
      redirect: 'error',
    });

    const ok = res.status >= 200 && res.status < 300;
    await PlatformDistributionWebhookRepo.markDelivery(webhook.id, ok).catch(
      () => {}
    );

    if (!ok) {
      const text = await res.text().catch(() => '');
      console.warn(
        `[platform-distribution] failed id=${webhook.id} status=${res.status}`,
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
      `[platform-distribution] delivered id=${webhook.id} event=${event}`
    );
    return {
      webhookId: webhook.id,
      label: webhook.label,
      ok: true,
      statusCode: res.status,
    };
  } catch (err) {
    await PlatformDistributionWebhookRepo.markDelivery(webhook.id, false).catch(
      () => {}
    );
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[platform-distribution] error id=${webhook.id}`, message);
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
  const idx = attemptAfterIncrement - 1;
  if (idx < 0 || idx >= DISTRIBUTION_RETRY_BACKOFF_MS.length) return null;
  return new Date(Date.now() + DISTRIBUTION_RETRY_BACKOFF_MS[idx]);
}

async function processPlatformDeliveryRow(
  row: PlatformDeliveryRow
): Promise<DistributionDeliveryResult> {
  const webhook = await PlatformDistributionWebhookRepo.getById(row.webhookId);
  if (!webhook) {
    await PlatformDistributionDeliveryRepo.markAttempt({
      id: row.id,
      ok: false,
      error: 'Platform webhook missing',
      exhausted: true,
      nextAttemptAt: null,
    });
    return {
      webhookId: row.webhookId,
      label: 'missing',
      ok: false,
      error: 'Platform webhook missing',
      deliveryId: row.id,
    };
  }

  const payload = (row.payload || {}) as Record<string, unknown>;
  const result = await postPlatformOnce(webhook, payload);
  const nextAttempt = row.attempt + 1;

  if (result.ok) {
    await PlatformDistributionDeliveryRepo.markAttempt({
      id: row.id,
      ok: true,
      httpStatus: result.statusCode ?? null,
      error: null,
      nextAttemptAt: null,
    });
  } else {
    const exhausted = nextAttempt >= row.maxAttempts;
    const nextAt = exhausted ? null : nextBackoffDate(nextAttempt);
    await PlatformDistributionDeliveryRepo.markAttempt({
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

function summarizePlatform(
  rows: PlatformDeliveryRow[]
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
    label = DISTRIBUTION_FAILED_LABEL;
  } else if (anyFailed && rows.some((r) => r.status === 'success')) {
    status = 'partial';
    label = DISTRIBUTION_PARTIAL_LABEL;
  } else if (anyPending) {
    status = 'queued';
    label = 'Sending to Zapier…';
  }
  return {
    queued: true,
    contentType: 'text',
    deliveryIds,
    status,
    label,
  };
}

/**
 * After human approval of an Antelope growth draft — queue platform Catch Hooks.
 * Never throws through to undo approval.
 */
export async function queuePlatformGrowthOnApproval(params: {
  draft: MarketingDraft;
  actorUserId: number;
  actorEmail?: string | null;
}): Promise<DistributionQueueSummary> {
  try {
    const destinations =
      await PlatformDistributionWebhookRepo.listEnabledForContent('text');
    if (!destinations.length) {
      return {
        queued: false,
        contentType: 'text',
        deliveryIds: [],
        status: 'none',
        label: '',
      };
    }

    const payload: ApprovedContentPayload = {
      event: 'content.approved',
      id: `antelope-growth-${params.draft.id}`,
      organization: { id: 0, name: 'Antelope' },
      content_type: 'text',
      platform_hint: 'x',
      caption: params.draft.body,
      hashtags: (params.draft.body.match(/#[\w]+/g) || []).map((t) =>
        t.slice(1)
      ),
      ai_disclosure: null,
      media_url: null,
      media_expires_at: null,
      thumbnail_url: null,
      approved_by: {
        user_id: params.actorUserId,
        email: params.actorEmail ?? null,
      },
      approved_at: new Date().toISOString(),
    };

    // Extend with platform scope marker for Zap mapping
    const body = {
      ...payload,
      scope: 'platform',
      channel: 'antelope_growth',
      marketing_draft_id: params.draft.id,
      topic: params.draft.topic,
    };

    const deliveryIds: number[] = [];
    for (const dest of destinations) {
      const row = await PlatformDistributionDeliveryRepo.create({
        marketingDraftId: params.draft.id,
        stagedActionId: params.draft.stagedActionId,
        webhookId: dest.id,
        payload: body as unknown as Record<string, unknown>,
        nextAttemptAt: new Date(),
      });
      deliveryIds.push(row.id);
    }

    scheduleDistributionWork(async () => {
      await processDuePlatformDeliveries({ deliveryIds });
    });

    return {
      queued: true,
      contentType: 'text',
      deliveryIds,
      status: 'queued',
      label: 'Sending to Zapier…',
    };
  } catch (err) {
    console.warn(
      '[platform-distribution] queue failed',
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

export async function processDuePlatformDeliveries(opts?: {
  marketingDraftId?: number;
  deliveryIds?: number[];
  limit?: number;
}): Promise<{ processed: number; succeeded: number; failed: number }> {
  let rows: PlatformDeliveryRow[];
  if (opts?.deliveryIds?.length) {
    rows = await PlatformDistributionDeliveryRepo.listByIds(opts.deliveryIds);
    rows = rows.filter(
      (r) =>
        (r.status === 'pending' || r.status === 'failed') &&
        r.attempt < r.maxAttempts
    );
  } else {
    rows = await PlatformDistributionDeliveryRepo.listDue(opts?.limit ?? 50);
    if (opts?.marketingDraftId) {
      rows = rows.filter(
        (r) => r.marketingDraftId === opts.marketingDraftId
      );
    }
  }
  let succeeded = 0;
  let failed = 0;
  for (const row of rows) {
    const result = await processPlatformDeliveryRow(row);
    if (result.ok) succeeded++;
    else failed++;
  }
  return { processed: rows.length, succeeded, failed };
}

export async function sendTestPlatformWebhook(
  webhookId: number
): Promise<DistributionDeliveryResult> {
  const webhook = await PlatformDistributionWebhookRepo.getById(webhookId);
  if (!webhook) throw new Error('Platform webhook not found');
  await assertSafeHttpsWebhookUrl(webhook.url);

  const now = new Date().toISOString();
  const payload = {
    event: 'webhook.test',
    id: `platform-test-${webhookId}-${Date.now()}`,
    organization: { id: 0, name: 'Antelope' },
    content_type: webhook.contentTypes[0] || 'text',
    platform_hint: 'x',
    caption:
      'Antelope platform test — if you see this in Zapier/Make, the growth Catch Hook is connected.',
    ai_disclosure: null,
    media_url: null,
    media_expires_at: null,
    thumbnail_url: null,
    approved_by: { user_id: 0, email: null },
    approved_at: now,
    scope: 'platform',
    channel: 'antelope_growth',
    metadata: { test: true, source: 'admin.growth.publishing.send_test' },
  };

  return postPlatformOnce(webhook, payload);
}

export async function getPlatformDistributionStatusForDraft(
  marketingDraftId: number
): Promise<DistributionQueueSummary & { deliveries: PlatformDeliveryRow[] }> {
  const deliveries =
    await PlatformDistributionDeliveryRepo.listByDraft(marketingDraftId);
  return { ...summarizePlatform(deliveries), deliveries };
}

export { summarizePlatform };
