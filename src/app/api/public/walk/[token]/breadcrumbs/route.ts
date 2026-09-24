import { NextRequest, NextResponse } from 'next/server';
import { WalkTokenRepo } from '@/app/utils/database/walk-token-repo';
import { PayrollRepo } from '@/app/utils/database/payroll-repo';

export const runtime = 'nodejs';

/**
 * POST /api/public/walk/[token]/breadcrumbs
 * Flush GPS samples for paid canvassers only. Idempotent via client_event_id.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token: raw } = await context.params;
    const rawToken = String(raw || '').trim();
    if (!rawToken || rawToken.length < 16) {
      return NextResponse.json({ status: false, message: 'Invalid token' }, { status: 404 });
    }

    const walk = await WalkTokenRepo.resolveActive(rawToken);
    if (!walk) {
      return NextResponse.json(
        { status: false, message: 'Link expired or revoked' },
        { status: 403 }
      );
    }

    const paid = await PayrollRepo.isPaidCanvasser(
      walk.organization_id,
      walk.canvasser_user_id
    );
    if (!paid) {
      return NextResponse.json(
        { status: false, message: 'GPS tracking not enabled for this canvasser' },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const points = Array.isArray(body.points) ? body.points : [];
    if (!points.length) {
      return NextResponse.json(
        { status: false, message: 'points[] required' },
        { status: 400 }
      );
    }
    if (points.length > 500) {
      return NextResponse.json(
        { status: false, message: 'Max 500 points per sync' },
        { status: 400 }
      );
    }

    const result = await PayrollRepo.ingestBreadcrumbs({
      organizationId: walk.organization_id,
      canvasserUserId: walk.canvasser_user_id,
      turfId: walk.turf_id,
      walkTokenId: walk.id,
      points: points.map((p: any) => ({
        clientEventId: String(p.clientEventId || ''),
        latitude: Number(p.latitude ?? p.lat),
        longitude: Number(p.longitude ?? p.lng),
        accuracyM: p.accuracyM ?? p.accuracy ?? null,
        recordedAt: p.recordedAt,
      })),
    });

    void WalkTokenRepo.touchLastUsed(walk.id);

    // Refresh today's rollup for this canvasser (cheap)
    const today = new Date().toISOString().slice(0, 10);
    void PayrollRepo.recomputeRange({
      organizationId: walk.organization_id,
      fromDate: today,
      toDate: today,
    }).catch(() => undefined);

    return NextResponse.json({
      status: true,
      accepted: result.accepted,
      skipped: result.skipped,
      errors: result.errors.slice(0, 20),
    });
  } catch (error) {
    console.error('[public/walk breadcrumbs]', error);
    return NextResponse.json(
      { status: false, message: error instanceof Error ? error.message : 'Sync failed' },
      { status: 500 }
    );
  }
}
