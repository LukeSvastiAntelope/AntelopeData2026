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

type Ctx = { params: Promise<{ id: string }> };

function parseContentTypes(raw: unknown): DistributionContentType[] | undefined {
  if (raw == null) return undefined;
  const allowed = new Set(['video', 'text']);
  const arr = Array.isArray(raw) ? raw : [];
  const out = arr
    .map((v) => String(v).toLowerCase())
    .filter((v): v is DistributionContentType => allowed.has(v));
  return out.length ? Array.from(new Set(out)) : ['video', 'text'];
}

/**
 * PATCH  /api/channels/publishing/[id] — update label / URL / types / enabled
 * DELETE /api/channels/publishing/[id]
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = requireUserId(req);
  if (typeof auth !== 'string') return auth;

  try {
    const { id: idRaw } = await ctx.params;
    const id = Number(idRaw);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json(
        { status: false, message: 'Invalid id' },
        { status: 400 }
      );
    }

    const organizationId = await ensurePrimaryOrgId(auth);
    const body = await req.json().catch(() => ({}));

    if (body.url != null && String(body.url).trim()) {
      await assertSafeHttpsWebhookUrl(String(body.url).trim());
    }

    const updated = await DistributionWebhookRepo.update(organizationId, id, {
      label: body.label != null ? String(body.label).trim() : undefined,
      url: body.url != null ? String(body.url).trim() : undefined,
      contentTypes: parseContentTypes(
        body.contentTypes ?? body.content_types
      ),
      enabled: body.enabled != null ? Boolean(body.enabled) : undefined,
      rotateSecret: Boolean(body.rotateSecret),
    });

    if (!updated) {
      return NextResponse.json(
        { status: false, message: 'Destination not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      status: true,
      webhook: toPublicWebhook(updated),
      ...(body.rotateSecret ? { secret: updated.secret } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update';
    console.error('[publishing] patch error', err);
    const clientError =
      /https|Invalid|not allowed|private|credentials|resolved/i.test(message);
    return NextResponse.json(
      { status: false, message },
      { status: clientError ? 400 : 500 }
    );
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const auth = requireUserId(req);
  if (typeof auth !== 'string') return auth;

  try {
    const { id: idRaw } = await ctx.params;
    const id = Number(idRaw);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json(
        { status: false, message: 'Invalid id' },
        { status: 400 }
      );
    }

    const organizationId = await ensurePrimaryOrgId(auth);
    const ok = await DistributionWebhookRepo.delete(organizationId, id);
    if (!ok) {
      return NextResponse.json(
        { status: false, message: 'Destination not found' },
        { status: 404 }
      );
    }
    return NextResponse.json({ status: true });
  } catch (err) {
    console.error('[publishing] delete error', err);
    return NextResponse.json(
      { status: false, message: 'Failed to delete destination' },
      { status: 500 }
    );
  }
}
