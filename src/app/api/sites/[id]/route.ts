/**
 * GET    /api/sites/[id]
 * PATCH  /api/sites/[id] — draft edits (content, theme, pages, template, slug)
 * DELETE /api/sites/[id]
 */

import { NextRequest, NextResponse } from 'next/server';
import { SiteRepo } from '@/app/utils/database/site-repo';
import { requireWebsiteAccess } from '@/app/utils/services/site-access';
import {
  SITE_TEMPLATE_META,
  type SiteContent,
  type SitePageKey,
  type SiteStatus,
  type SiteTemplateId,
  type SiteTheme,
} from '@/app/utils/types/site';

type RouteContext = { params: Promise<{ id: string }> };

const TEMPLATE_IDS = Object.keys(SITE_TEMPLATE_META) as SiteTemplateId[];
const PAGE_KEYS: SitePageKey[] = [
  'home',
  'issues',
  'events',
  'volunteer',
  'donate',
];

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const { id: rawId } = await context.params;
    const siteId = parseId(rawId);
    if (!siteId) {
      return NextResponse.json(
        { status: false, message: 'Invalid site id' },
        { status: 400 }
      );
    }

    const access = await requireWebsiteAccess(req);
    if (access instanceof NextResponse) return access;

    const site = await SiteRepo.getSiteById(siteId, access.organizationId);
    if (!site) {
      return NextResponse.json(
        { status: false, message: 'Site not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ status: true, site });
  } catch (error) {
    console.error('[api/sites/:id GET]', error);
    return NextResponse.json(
      { status: false, message: 'Failed to load site' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const { id: rawId } = await context.params;
    const siteId = parseId(rawId);
    if (!siteId) {
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

    const patch: {
      templateId?: SiteTemplateId;
      slug?: string;
      theme?: SiteTheme;
      content?: SiteContent;
      enabledPages?: SitePageKey[];
      status?: SiteStatus;
    } = {};

    if (
      body?.templateId &&
      TEMPLATE_IDS.includes(body.templateId as SiteTemplateId)
    ) {
      patch.templateId = body.templateId as SiteTemplateId;
    }
    if (typeof body?.slug === 'string' && body.slug.trim()) {
      patch.slug = body.slug.trim();
    }
    if (body?.theme && typeof body.theme === 'object') {
      patch.theme = body.theme as SiteTheme;
    }
    if (body?.content && typeof body.content === 'object') {
      patch.content = body.content as SiteContent;
    }
    if (Array.isArray(body?.enabledPages)) {
      const pages = (body.enabledPages as string[])
        .filter((p): p is SitePageKey =>
          PAGE_KEYS.includes(p as SitePageKey)
        );
      if (!pages.includes('home')) pages.unshift('home');
      patch.enabledPages = pages;
    }
    if (body?.status === 'published' || body?.status === 'draft') {
      patch.status = body.status;
    }

    const ok = await SiteRepo.updateSite(
      siteId,
      access.organizationId,
      patch
    );
    if (!ok) {
      return NextResponse.json(
        { status: false, message: 'Update failed' },
        { status: 500 }
      );
    }

    const site = await SiteRepo.getSiteById(siteId, access.organizationId);
    return NextResponse.json({ status: true, site });
  } catch (error) {
    console.error('[api/sites/:id PATCH]', error);
    return NextResponse.json(
      { status: false, message: 'Failed to update site' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const { id: rawId } = await context.params;
    const siteId = parseId(rawId);
    if (!siteId) {
      return NextResponse.json(
        { status: false, message: 'Invalid site id' },
        { status: 400 }
      );
    }

    const access = await requireWebsiteAccess(req);
    if (access instanceof NextResponse) return access;

    const ok = await SiteRepo.deleteSite(siteId, access.organizationId);
    if (!ok) {
      return NextResponse.json(
        { status: false, message: 'Site not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ status: true });
  } catch (error) {
    console.error('[api/sites/:id DELETE]', error);
    return NextResponse.json(
      { status: false, message: 'Failed to delete site' },
      { status: 500 }
    );
  }
}
