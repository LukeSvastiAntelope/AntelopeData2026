import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/app/utils/auth/require-user';
import { CanvassContactRepo } from '@/app/utils/database/turf-repo';
import { ensurePrimaryOrgId } from '@/app/api/dashboard/persons/org';

export const runtime = 'nodejs';

/**
 * GET /api/dashboard/canvass-contacts
 * G4 sync surface — pull append-only contact deltas.
 * Query: sinceId, since (ISO), canvasserId|me, turfId, limit
 */
export async function GET(request: NextRequest) {
  try {
    const auth = requireUserId(request);
    if (typeof auth !== 'string') return auth;
    const userId = Number(auth);
    const orgId = await ensurePrimaryOrgId(userId);
    const sp = request.nextUrl.searchParams;
    const sinceIdRaw = sp.get('sinceId');
    const since = sp.get('since');
    const canvasserRaw = sp.get('canvasserId');
    const turfIdRaw = sp.get('turfId');
    const limitRaw = sp.get('limit');

    const canvasserId =
      canvasserRaw === 'me'
        ? Number(userId)
        : canvasserRaw != null
          ? Number(canvasserRaw)
          : null;

    const contacts = await CanvassContactRepo.listSince({
      organizationId: orgId,
      sinceId: sinceIdRaw != null ? Number(sinceIdRaw) : null,
      since,
      canvasserId: Number.isFinite(canvasserId as number) ? canvasserId : null,
      turfId: turfIdRaw != null ? Number(turfIdRaw) : null,
      limit: limitRaw != null ? Number(limitRaw) : 500,
    });

    const nextSinceId =
      contacts.length > 0 ? contacts[contacts.length - 1].id : sinceIdRaw != null
        ? Number(sinceIdRaw)
        : null;

    return NextResponse.json({
      status: true,
      organizationId: orgId,
      contacts,
      nextSinceId,
    });
  } catch (error) {
    console.error('[canvass-contacts GET]', error);
    return NextResponse.json(
      { status: false, message: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}
