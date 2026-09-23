/**
 * GET  /api/sites — list sites for org
 * POST /api/sites — create site from template (seeded with campaign context)
 */

import { NextRequest, NextResponse } from 'next/server';
import { SiteRepo } from '@/app/utils/database/site-repo';
import {
  getOrgCampaignContext,
  requireWebsiteAccess,
} from '@/app/utils/services/site-access';
import {
  SITE_TEMPLATE_META,
  defaultSiteContent,
  type SitePageKey,
  type SiteTemplateId,
} from '@/app/utils/types/site';

const TEMPLATE_IDS = Object.keys(SITE_TEMPLATE_META) as SiteTemplateId[];

function isTemplateId(value: unknown): value is SiteTemplateId {
  return typeof value === 'string' && TEMPLATE_IDS.includes(value as SiteTemplateId);
}

export async function GET(req: NextRequest) {
  try {
    const hint = Number(req.nextUrl.searchParams.get('organizationId'));
    const access = await requireWebsiteAccess(
      req,
      Number.isFinite(hint) && hint > 0 ? hint : null
    );
    if (access instanceof NextResponse) return access;

    const sites = await SiteRepo.listSitesByOrganization(access.organizationId);
    return NextResponse.json({
      status: true,
      organizationId: access.organizationId,
      sites,
      templates: Object.values(SITE_TEMPLATE_META),
    });
  } catch (error) {
    console.error('[api/sites GET]', error);
    return NextResponse.json(
      { status: false, message: 'Failed to list sites' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const access = await requireWebsiteAccess(
      req,
      body?.organizationId != null ? Number(body.organizationId) : null
    );
    if (access instanceof NextResponse) return access;

    if (!isTemplateId(body?.templateId)) {
      return NextResponse.json(
        { status: false, message: 'templateId required' },
        { status: 400 }
      );
    }

    const org = await getOrgCampaignContext(access.organizationId);
    const enabledPages: SitePageKey[] = Array.isArray(body?.enabledPages)
      ? (body.enabledPages as SitePageKey[]).filter(Boolean)
      : ['home'];
    if (!enabledPages.includes('home')) enabledPages.unshift('home');

    const seedContent = defaultSiteContent({
      meta: {
        candidateName:
          org?.candidateName?.trim() || org?.name?.trim() || 'Your Name',
        office: org?.officeType?.trim() || 'Office Sought',
        electionDate: org?.electionYear != null ? String(org.electionYear) : undefined,
        partyLabel: org?.party ?? null,
      },
    });

    const siteId = await SiteRepo.createSite({
      organizationId: access.organizationId,
      templateId: body.templateId,
      content: seedContent,
      enabledPages,
      status: 'draft',
      createdBy: access.userIdNum,
      theme: body?.theme,
      slug: typeof body?.slug === 'string' ? body.slug : undefined,
    });

    const site = await SiteRepo.getSiteById(siteId, access.organizationId);
    return NextResponse.json({ status: true, site }, { status: 201 });
  } catch (error) {
    console.error('[api/sites POST]', error);
    return NextResponse.json(
      { status: false, message: 'Failed to create site' },
      { status: 500 }
    );
  }
}
