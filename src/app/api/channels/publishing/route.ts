import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/app/utils/auth/require-user';
import { ensurePrimaryOrgId } from '@/app/api/dashboard/persons/org';
import {
  DistributionWebhookRepo,
  toPublicWebhook,
  type DistributionContentType,
} from '@/app/utils/database/distribution-webhook-repo';
import { assertSafeHttpsWebhookUrl } from '@/app/utils/services/distribution-webhook-service';

export const runtime = 'nodejs';

function parseContentTypes(raw: unknown): DistributionContentType[] {
  const allowed = new Set(['video', 'text', 'image']);
  const arr = Array.isArray(raw) ? raw : [];
  const out = arr
    .map((v) => String(v).toLowerCase())
    .filter((v): v is DistributionContentType => allowed.has(v));
  return out.length ? Array.from(new Set(out)) : ['video', 'text'];
}

/**
 * GET  /api/channels/publishing — list destinations (masked URLs)
 * POST /api/channels/publishing — create destination
 */
export async function GET(req: NextRequest) {
  const auth = requireUserId(req);
  if (typeof auth !== 'string') return auth;

  try {
    const organizationId = await ensurePrimaryOrgId(auth);
    const rows = await DistributionWebhookRepo.listByOrg(organizationId);
    return NextResponse.json({
      status: true,
      organizationId,
      webhooks: rows.map(toPublicWebhook),
    });
  } catch (err) {
    console.error('[publishing] list error', err);
    return NextResponse.json(
      { status: false, message: 'Failed to list publishing destinations' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = requireUserId(req);
  if (typeof auth !== 'string') return auth;

  try {
    const organizationId = await ensurePrimaryOrgId(auth);
    const body = await req.json().catch(() => ({}));
    const label = String(body.label || '').trim();
    const url = String(body.url || '').trim();
    const contentTypes = parseContentTypes(body.contentTypes ?? body.content_types);
    const enabled = body.enabled !== false;

    if (!label) {
      return NextResponse.json(
        { status: false, message: 'Label is required' },
        { status: 400 }
      );
    }
    if (!url) {
      return NextResponse.json(
        { status: false, message: 'Webhook URL is required' },
        { status: 400 }
      );
    }

    await assertSafeHttpsWebhookUrl(url);

    const created = await DistributionWebhookRepo.create({
      organizationId,
      label,
      url,
      contentTypes,
      enabled,
    });

    // Secret returned once on create so the campaign can verify signatures.
    return NextResponse.json({
      status: true,
      webhook: toPublicWebhook(created),
      secret: created.secret,
      message:
        'Destination saved. Copy the signing secret now — it is not shown in full again.',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save destination';
    console.error('[publishing] create error', err);
    const clientError =
      /https|Invalid|not allowed|private|credentials|resolved/i.test(message);
    return NextResponse.json(
      { status: false, message },
      { status: clientError ? 400 : 500 }
    );
  }
}
