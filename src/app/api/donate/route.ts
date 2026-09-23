/**
 * POST /api/donate — thin public fundraising intent capture (Sites S5).
 * No payment processor here — records donor interest into the org's loop.
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
      amount,
      notes,
      organizationId: clientOrgId,
    } = body as {
      siteSlug?: string;
      name?: string;
      email?: string;
      phone?: string;
      amount?: number | string;
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

    let amountCents: number | null = null;
    if (amount != null && String(amount).trim() !== '') {
      const dollars = Number(amount);
      if (!Number.isFinite(dollars) || dollars < 0 || dollars > 1_000_000) {
        return NextResponse.json(
          { status: false, message: 'Invalid amount' },
          { status: 400 }
        );
      }
      amountCents = Math.round(dollars * 100);
    }

    const { ip, userAgent } = requestClientMeta(req);
    const rateKey = `donate:site:${String(siteSlug).trim()}:${ip || email || phone}`;
    if (!checkSiteFormRateLimit(rateKey, 8)) {
      return NextResponse.json(
        { status: false, message: 'Too many submissions. Please try again later.' },
        { status: 429 }
      );
    }

    const captured = await captureSiteForm({
      siteSlug: String(siteSlug).trim(),
      formType: 'donate',
      name,
      email: email || null,
      phone: phone || null,
      message: notes || null,
      amountCents,
      metadata: {
        fundraising: true,
        amountDollars: amountCents != null ? amountCents / 100 : null,
        rejectedClientOrganizationId:
          clientOrgId != null ? Number(clientOrgId) : null,
      },
      ip,
      userAgent,
    });

    return NextResponse.json({
      status: true,
      message: captured.suppressed
        ? 'Interest recorded. This contact is on the campaign do-not-contact list.'
        : 'Thank you! Your fundraising interest was recorded for the campaign.',
      organizationId: captured.organizationId,
      siteSlug: captured.siteSlug,
      suppressed: captured.suppressed,
      submissionId: captured.submissionId,
      personRecordId: captured.personRecordId,
      // Seam for a future Stripe / ActBlue Checkout — not built here.
      billing: {
        stubbed: true,
        todo: 'Wire payment processor; this endpoint records intent only',
      },
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
    console.error('[api/donate]', error);
    return NextResponse.json(
      { status: false, message: 'Failed to record donation interest' },
      { status: 500 }
    );
  }
}
