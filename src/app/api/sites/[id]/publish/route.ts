/**
 * POST /api/sites/[id]/publish — flip status published ↔ draft.
 * Publishing makes /s/<slug> live; unpublish keeps content + published_at history.
 */

import { NextRequest, NextResponse } from 'next/server';
import { SiteRepo } from '@/app/utils/database/site-repo';
import { requireWebsiteAccess } from '@/app/utils/services/site-access';
import type { SiteStatus } from '@/app/utils/types/site';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { id: rawId } = await context.params;
    const siteId = Number(rawId);
    if (!Number.isFinite(siteId) || siteId <= 0) {
      return NextResponse.json(
        { status: false, message: 'Invalid site id' },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const access = await requireWebsiteAccess(
      req,
      body?.organizationId != null ? Number(body.organizationId) : null
    );
    if (access instanceof NextResponse) return access;

    const existing = await SiteRepo.getSiteById(siteId, access.organizationId);
    if (!existing) {
      return NextResponse.json(
        { status: false, message: 'Site not found' },
        { status: 404 }
      );
    }

    let nextStatus: SiteStatus;
    if (body?.published === true || body?.status === 'published') {
      nextStatus = 'published';
    } else if (body?.published === false || body?.status === 'draft') {
      nextStatus = 'draft';
    } else {
      nextStatus = existing.status === 'published' ? 'draft' : 'published';
    }

    // Persist any in-flight draft content alongside the status flip.
    const ok = await SiteRepo.updateSite(siteId, access.organizationId, {
      status: nextStatus,
      content:
        body?.content && typeof body.content === 'object'
          ? body.content
          : undefined,
      theme:
        body?.theme && typeof body.theme === 'object' ? body.theme : undefined,
      enabledPages: Array.isArray(body?.enabledPages)
        ? body.enabledPages
        : undefined,
    });

    if (!ok) {
      return NextResponse.json(
        { status: false, message: 'Publish update failed' },
        { status: 500 }
      );
    }

    const site = await SiteRepo.getSiteById(siteId, access.organizationId);
    return NextResponse.json({
      status: true,
      site,
      publicPath: site ? `/s/${site.slug}` : null,
    });
  } catch (error) {
    console.error('[api/sites/:id/publish]', error);
    return NextResponse.json(
      { status: false, message: 'Failed to update publish status' },
      { status: 500 }
    );
  }
}
