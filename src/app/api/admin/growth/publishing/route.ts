import { NextRequest, NextResponse } from 'next/server';
import {
  requireSuperAdmin,
  clientIp,
} from '@/app/utils/auth/require-super-admin';
import { writeAdminAuditLog } from '@/app/utils/database/admin-audit-repo';
import {
  PlatformDistributionWebhookRepo,
  toPublicPlatformWebhook,
} from '@/app/utils/database/platform-distribution-webhook-repo';
import { assertSafeHttpsWebhookUrl } from '@/app/utils/services/distribution-webhook-service';
import type { DistributionContentType } from '@/app/utils/database/distribution-webhook-repo';

export const runtime = 'nodejs';

function parseContentTypes(raw: unknown): DistributionContentType[] {
  const allowed = new Set(['video', 'text', 'image']);
  const arr = Array.isArray(raw) ? raw : [];
  const out = arr
    .map((v) => String(v).toLowerCase())
    .filter((v): v is DistributionContentType => allowed.has(v));
  return out.length ? Array.from(new Set(out)) : ['text'];
}

/**
 * GET  /api/admin/growth/publishing — list platform destinations (masked)
 * POST /api/admin/growth/publishing — create platform destination
 */
export async function GET(req: NextRequest) {
  try {
    const gate = await requireSuperAdmin(req);
    if (gate instanceof NextResponse) return gate;

    const rows = await PlatformDistributionWebhookRepo.listAll();
    await writeAdminAuditLog({
      actorUserId: gate.numericUserId,
      action: 'growth.publishing_list',
      targetType: 'platform_webhook',
      ip: clientIp(req),
    });
    return NextResponse.json({
      status: true,
      webhooks: rows.map(toPublicPlatformWebhook),
    });
  } catch (err) {
    console.error('[admin/growth/publishing GET]', err);
    return NextResponse.json(
      { status: false, message: 'Failed to list platform destinations' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const gate = await requireSuperAdmin(req);
    if (gate instanceof NextResponse) return gate;

    const body = await req.json().catch(() => ({}));
    const label = String(body.label || '').trim() || 'Antelope X via Zapier';
    const url = String(body.url || '').trim();
    const contentTypes = parseContentTypes(
      body.contentTypes ?? body.content_types ?? ['text']
    );
    const enabled = body.enabled !== false;

    if (!url) {
      return NextResponse.json(
        { status: false, message: 'Webhook URL is required' },
        { status: 400 }
      );
    }

    await assertSafeHttpsWebhookUrl(url);

    const created = await PlatformDistributionWebhookRepo.create({
      label,
      url,
      contentTypes,
      enabled,
    });

    await writeAdminAuditLog({
      actorUserId: gate.numericUserId,
      action: 'growth.publishing_create',
      targetType: 'platform_webhook',
      targetId: created.id,
      metadata: { label: created.label, contentTypes: created.contentTypes },
      ip: clientIp(req),
    });

    return NextResponse.json({
      status: true,
      webhook: toPublicPlatformWebhook(created),
      secret: created.secret,
      message:
        'Platform destination saved. Copy the signing secret now — it is not shown in full again.',
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to save destination';
    console.error('[admin/growth/publishing POST]', err);
    const clientError =
      /https|Invalid|not allowed|private|credentials|resolved/i.test(message);
    return NextResponse.json(
      { status: false, message },
      { status: clientError ? 400 : 500 }
    );
  }
}
