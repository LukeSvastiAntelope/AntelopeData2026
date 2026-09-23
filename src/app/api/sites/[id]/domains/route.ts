/**
 * GET  /api/sites/[id]/domains — list custom domains (Website add-on)
 * POST /api/sites/[id]/domains — connect a custom host via Vercel Domains API
 */

import { NextRequest, NextResponse } from 'next/server';
import { SiteRepo } from '@/app/utils/database/site-repo';
import {
  SiteDomainRepo,
  newVerificationToken,
} from '@/app/utils/database/site-domain-repo';
import { requireWebsiteAccess } from '@/app/utils/services/site-access';
import { vercelAddProjectDomain } from '@/app/utils/services/vercel-domains';
import {
  getSiteRootDomain,
  isValidCustomHost,
  normalizeHost,
  platformSubdomainUrl,
} from '@/app/utils/site-host';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const { id: rawId } = await context.params;
    const siteId = Number(rawId);
    if (!Number.isFinite(siteId) || siteId <= 0) {
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

    const domains = await SiteDomainRepo.listBySite(
      siteId,
      access.organizationId
    );

    return NextResponse.json({
      status: true,
      site: {
        id: site.id,
        slug: site.slug,
        status: site.status,
      },
      platformSubdomain: platformSubdomainUrl(site.slug),
      siteRootDomain: getSiteRootDomain(),
      domains,
    });
  } catch (error) {
    console.error('[api/sites/:id/domains GET]', error);
    return NextResponse.json(
      { status: false, message: 'Failed to list domains' },
      { status: 500 }
    );
  }
}

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

    const site = await SiteRepo.getSiteById(siteId, access.organizationId);
    if (!site) {
      return NextResponse.json(
        { status: false, message: 'Site not found' },
        { status: 404 }
      );
    }

    // Tier gate: Website add-on already enforced; custom domains also need publish
    if (site.status !== 'published') {
      return NextResponse.json(
        {
          status: false,
          message: 'Publish the site before connecting a custom domain',
          code: 'NOT_PUBLISHED',
        },
        { status: 400 }
      );
    }

    const host = normalizeHost(body?.host);
    if (!host || !isValidCustomHost(host)) {
      return NextResponse.json(
        {
          status: false,
          message:
            'Enter a valid custom hostname (not the Antelope app host or *.platform subdomain)',
        },
        { status: 400 }
      );
    }

    const existing = await SiteDomainRepo.getByHost(host);
    if (existing && existing.organizationId !== access.organizationId) {
      return NextResponse.json(
        { status: false, message: 'That domain is already connected to another campaign' },
        { status: 409 }
      );
    }
    if (existing && existing.siteId === siteId) {
      return NextResponse.json({ status: true, domain: existing, already: true });
    }
    if (existing) {
      return NextResponse.json(
        { status: false, message: 'Domain already registered on another site in this org' },
        { status: 409 }
      );
    }

    const token = newVerificationToken();
    const vercel = await vercelAddProjectDomain(host, token);

    if (!vercel.ok && !vercel.stubbed) {
      return NextResponse.json(
        {
          status: false,
          message: vercel.message || 'Failed to register domain with Vercel',
        },
        { status: 502 }
      );
    }

    const domainId = await SiteDomainRepo.create({
      siteId,
      organizationId: access.organizationId,
      host,
      verificationToken: token,
      vercelDomainId: vercel.vercelDomainId,
      dnsInstructions: {
        records: vercel.dns,
        stubbed: vercel.stubbed,
        note: vercel.message || null,
      },
    });

    // If Vercel already reports verified, flip our flag
    if (vercel.verified) {
      await SiteDomainRepo.markVerified(domainId, access.organizationId);
    }

    const domain = await SiteDomainRepo.getById(domainId, access.organizationId);
    return NextResponse.json(
      {
        status: true,
        domain,
        vercel: {
          stubbed: vercel.stubbed,
          verified: vercel.verified,
          dns: vercel.dns,
          message: vercel.message,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[api/sites/:id/domains POST]', error);
    const msg = error instanceof Error ? error.message : 'Failed to connect domain';
    if (/Duplicate|ER_DUP_ENTRY/i.test(msg)) {
      return NextResponse.json(
        { status: false, message: 'That domain is already connected' },
        { status: 409 }
      );
    }
    return NextResponse.json({ status: false, message: msg }, { status: 500 });
  }
}
