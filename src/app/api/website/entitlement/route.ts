/**
 * GET  /api/website/entitlement — { entitled, organizationId }
 * POST /api/website/entitlement — enable website add-on (Stripe TODO seam)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/app/utils/auth/require-user';
import {
  enableWebsiteAddon,
  getPrimaryOrganizationId,
  hasWebsiteAddon,
} from '@/app/utils/services/org-entitlements';

export async function GET(req: NextRequest) {
  try {
    const auth = requireUserId(req);
    if (typeof auth !== 'string') return auth;

    const organizationId = await getPrimaryOrganizationId(auth);
    if (!organizationId) {
      return NextResponse.json({
        status: true,
        entitled: false,
        organizationId: null,
        message: 'No campaign organization found',
      });
    }

    const entitled = await hasWebsiteAddon(organizationId);
    return NextResponse.json({
      status: true,
      entitled,
      organizationId,
    });
  } catch (error) {
    console.error('[website/entitlement GET]', error);
    return NextResponse.json(
      { status: false, message: 'Failed to check entitlement' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = requireUserId(req);
    if (typeof auth !== 'string') return auth;
    const userId = Number(auth);

    const body = await req.json().catch(() => ({}));
    const organizationId =
      body?.organizationId != null
        ? Number(body.organizationId)
        : await getPrimaryOrganizationId(auth);

    if (!organizationId || !Number.isFinite(organizationId)) {
      return NextResponse.json(
        { status: false, message: 'organizationId required' },
        { status: 400 }
      );
    }

    // TODO(stripe): create Checkout Session for $20/mo website add-on;
    // enable entitlement from webhook on invoice.paid / checkout.session.completed.
    // For now, flip the flag so the builder gate can be exercised end-to-end.
    await enableWebsiteAddon(organizationId, userId, {
      source: 'upsell_stub',
      priceHintUsdMonthly: 20,
      note: 'Stripe not wired — entitlement flipped for product development',
    });

    const entitled = await hasWebsiteAddon(organizationId);
    return NextResponse.json({
      status: true,
      entitled,
      organizationId,
      // Explicit seam for the future billing UI
      billing: {
        stubbed: true,
        todo: 'Replace with Stripe Checkout for website_addon',
      },
    });
  } catch (error) {
    console.error('[website/entitlement POST]', error);
    return NextResponse.json(
      { status: false, message: 'Failed to enable add-on' },
      { status: 500 }
    );
  }
}
