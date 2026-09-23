/**
 * GET /api/public/site-domain?host=www.example.com
 * Edge middleware uses this to resolve verified custom hosts → published slug.
 * No auth. Returns { slug } or 404.
 */

import { NextRequest, NextResponse } from 'next/server';
import { SiteDomainRepo } from '@/app/utils/database/site-domain-repo';
import {
  isAppHost,
  normalizeHost,
  slugFromPlatformSubdomain,
} from '@/app/utils/site-host';
import { SiteRepo } from '@/app/utils/database/site-repo';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const host = normalizeHost(req.nextUrl.searchParams.get('host'));
    if (!host) {
      return NextResponse.json(
        { status: false, message: 'host required' },
        { status: 400 }
      );
    }

    // Never map the dashboard/apex host to a tenant site
    if (isAppHost(host)) {
      return NextResponse.json(
        { status: false, message: 'app host', code: 'APP_HOST' },
        { status: 404 }
      );
    }

    // Platform subdomain — confirm published, then return slug
    const platformSlug = slugFromPlatformSubdomain(host);
    if (platformSlug) {
      const site = await SiteRepo.getPublishedSiteBySlug(platformSlug);
      if (!site) {
        return NextResponse.json(
          { status: false, message: 'Site not published', code: 'NOT_PUBLISHED' },
          { status: 404 }
        );
      }
      return NextResponse.json(
        {
          status: true,
          slug: site.slug,
          kind: 'platform_subdomain',
        },
        {
          headers: {
            'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
          },
        }
      );
    }

    const slug = await SiteDomainRepo.resolvePublishedSlugByHost(host);
    if (!slug) {
      return NextResponse.json(
        { status: false, message: 'Unknown or unverified domain' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { status: true, slug, kind: 'custom' },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
        },
      }
    );
  } catch (error) {
    console.error('[api/public/site-domain]', error);
    return NextResponse.json(
      { status: false, message: 'Lookup failed' },
      { status: 500 }
    );
  }
}
