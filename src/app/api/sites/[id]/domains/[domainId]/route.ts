/**
 * POST   /api/sites/[id]/domains/[domainId]/verify — check Vercel / mark verified
 * DELETE /api/sites/[id]/domains/[domainId] — disconnect host
 */

import { NextRequest, NextResponse } from 'next/server';
import { SiteRepo } from '@/app/utils/database/site-repo';
import { SiteDomainRepo } from '@/app/utils/database/site-domain-repo';
import { requireWebsiteAccess } from '@/app/utils/services/site-access';
import {
  vercelRemoveProjectDomain,
  vercelVerifyProjectDomain,
} from '@/app/utils/services/vercel-domains';

type RouteContext = {
  params: Promise<{ id: string; domainId: string }>;
};

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { id: rawSiteId, domainId: rawDomainId } = await context.params;
    const siteId = Number(rawSiteId);
    const domainId = Number(rawDomainId);
    if (!Number.isFinite(siteId) || !Number.isFinite(domainId)) {
      return NextResponse.json(
        { status: false, message: 'Invalid id' },
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

    const domain = await SiteDomainRepo.getById(domainId, access.organizationId);
    if (!domain || domain.siteId !== siteId) {
      return NextResponse.json(
        { status: false, message: 'Domain not found' },
        { status: 404 }
      );
    }

    const vercel = await vercelVerifyProjectDomain(
      domain.host,
      domain.verificationToken
    );

    // Stub / local: allow forceVerify for ops testing when Vercel isn't wired
    const body = await req.json().catch(() => ({}));
    const force =
      body?.force === true &&
      (process.env.SITE_DOMAIN_ALLOW_FORCE_VERIFY === '1' ||
        process.env.NODE_ENV !== 'production');

    const shouldMark = vercel.verified || force;
    if (shouldMark) {
      await SiteDomainRepo.markVerified(domainId, access.organizationId);
    }

    const updated = await SiteDomainRepo.getById(domainId, access.organizationId);
    return NextResponse.json({
      status: true,
      domain: updated,
      vercel: {
        stubbed: vercel.stubbed,
        verified: vercel.verified,
        dns: vercel.dns,
        message: vercel.message,
        forced: Boolean(force && shouldMark),
      },
    });
  } catch (error) {
    console.error('[domains verify]', error);
    return NextResponse.json(
      { status: false, message: 'Verify failed' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const { id: rawSiteId, domainId: rawDomainId } = await context.params;
    const siteId = Number(rawSiteId);
    const domainId = Number(rawDomainId);
    if (!Number.isFinite(siteId) || !Number.isFinite(domainId)) {
      return NextResponse.json(
        { status: false, message: 'Invalid id' },
        { status: 400 }
      );
    }

    const access = await requireWebsiteAccess(req);
    if (access instanceof NextResponse) return access;

    const domain = await SiteDomainRepo.getById(domainId, access.organizationId);
    if (!domain || domain.siteId !== siteId) {
      return NextResponse.json(
        { status: false, message: 'Domain not found' },
        { status: 404 }
      );
    }

    await SiteDomainRepo.delete(domainId, access.organizationId);
    await vercelRemoveProjectDomain(domain.host).catch(() => undefined);

    return NextResponse.json({ status: true });
  } catch (error) {
    console.error('[domains DELETE]', error);
    return NextResponse.json(
      { status: false, message: 'Delete failed' },
      { status: 500 }
    );
  }
}
