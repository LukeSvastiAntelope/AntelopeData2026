/**
 * POST /api/volunteer — thin public volunteer capture (Sites S5).
 * Tenancy: organization_id derived from published siteSlug only.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  captureSiteForm,
  checkSiteFormRateLimit,
  requestClientMeta,
} from '@/app/utils/services/site-form-capture';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      siteSlug,
      name,
      email,
      phone,
      availability,
      notes,
      organizationId: clientOrgId,
    } = body as {
      siteSlug?: string;
      name?: string;
      email?: string;
      phone?: string;
      availability?: string;
      notes?: string;
      organizationId?: number;
    };

    if (!siteSlug || !String(siteSlug).trim()) {
      return NextResponse.json(
        { status: false, message: 'siteSlug required' },
        { status: 400 }
      );
    }
    if (!name || !String(name).trim()) {
      return NextResponse.json(
        { status: false, message: 'Name is required' },
        { status: 400 }
      );
    }
    if (!email && !phone) {
      return NextResponse.json(
        { status: false, message: 'Email or phone is required' },
        { status: 400 }
      );
    }

    void clientOrgId;

    const { ip, userAgent } = requestClientMeta(req);
    const rateKey = `volunteer:site:${String(siteSlug).trim()}:${ip || email || phone}`;
    if (!checkSiteFormRateLimit(rateKey, 8)) {
      return NextResponse.json(
        { status: false, message: 'Too many submissions. Please try again later.' },
        { status: 429 }
      );
    }

    const captured = await captureSiteForm({
      siteSlug: String(siteSlug).trim(),
      formType: 'volunteer',
      name,
      email: email || null,
      phone: phone || null,
      message: notes || null,
      metadata: {
        availability: availability || null,
        rejectedClientOrganizationId:
          clientOrgId != null ? Number(clientOrgId) : null,
      },
      ip,
      userAgent,
    });

    return NextResponse.json({
      status: true,
      message: captured.suppressed
        ? 'Thanks — we recorded your interest. This contact is on the campaign do-not-contact list.'
        : 'Thanks for volunteering! The campaign will be in touch.',
      organizationId: captured.organizationId,
      siteSlug: captured.siteSlug,
      suppressed: captured.suppressed,
      submissionId: captured.submissionId,
      personRecordId: captured.personRecordId,
    });
  } catch (error) {
    const statusCode =
      error && typeof error === 'object' && 'statusCode' in error
        ? Number((error as { statusCode: number }).statusCode)
        : 500;
    if (statusCode === 404) {
      return NextResponse.json(
        { status: false, message: 'Site not found or not published.' },
        { status: 404 }
      );
    }
    console.error('[api/volunteer]', error);
    return NextResponse.json(
      { status: false, message: 'Failed to record volunteer signup' },
      { status: 500 }
    );
  }
}
