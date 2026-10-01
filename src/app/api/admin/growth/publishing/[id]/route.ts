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

type Ctx = { params: Promise<{ id: string }> };

function parseContentTypes(
  raw: unknown
): DistributionContentType[] | undefined {
  if (raw == null) return undefined;
  const allowed = new Set(['video', 'text', 'image']);
  const arr = Array.isArray(raw) ? raw : [];
  const out = arr
    .map((v) => String(v).toLowerCase())
    .filter((v): v is DistributionContentType => allowed.has(v));
  return out.length ? Array.from(new Set(out)) : ['text'];
}

/**
 * PATCH  /api/admin/growth/publishing/[id]
 * DELETE /api/admin/growth/publishing/[id]
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const gate = await requireSuperAdmin(req);
    if (gate instanceof NextResponse) return gate;

    const { id: idRaw } = await ctx.params;
    const id = Number(idRaw);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json(
        { status: false, message: 'Invalid id' },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    if (body.url != null && String(body.url).trim()) {
      await assertSafeHttpsWebhookUrl(String(body.url).trim());
    }

    const updated = await PlatformDistributionWebhookRepo.update(id, {
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

    await writeAdminAuditLog({
      actorUserId: gate.numericUserId,
      action: 'growth.publishing_update',
      targetType: 'platform_webhook',
      targetId: id,
      metadata: {
        enabled: updated.enabled,
        rotateSecret: Boolean(body.rotateSecret),
      },
      ip: clientIp(req),
    });

    return NextResponse.json({
      status: true,
      webhook: toPublicPlatformWebhook(updated),
      ...(body.rotateSecret ? { secret: updated.secret } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update';
    console.error('[admin/growth/publishing PATCH]', err);
    const clientError =
      /https|Invalid|not allowed|private|credentials|resolved/i.test(message);
    return NextResponse.json(
      { status: false, message },
      { status: clientError ? 400 : 500 }
    );
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const gate = await requireSuperAdmin(req);
    if (gate instanceof NextResponse) return gate;

    const { id: idRaw } = await ctx.params;
    const id = Number(idRaw);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json(
        { status: false, message: 'Invalid id' },
        { status: 400 }
      );
    }

    const ok = await PlatformDistributionWebhookRepo.delete(id);
    if (!ok) {
      return NextResponse.json(
        { status: false, message: 'Destination not found' },
        { status: 404 }
      );
    }

    await writeAdminAuditLog({
      actorUserId: gate.numericUserId,
      action: 'growth.publishing_delete',
      targetType: 'platform_webhook',
      targetId: id,
      ip: clientIp(req),
    });

    return NextResponse.json({ status: true });
  } catch (err) {
    console.error('[admin/growth/publishing DELETE]', err);
    return NextResponse.json(
      { status: false, message: 'Failed to delete destination' },
      { status: 500 }
    );
  }
}
