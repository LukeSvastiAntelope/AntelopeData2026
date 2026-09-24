import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/app/utils/auth/require-user';
import { ensurePrimaryOrgId } from '@/app/api/dashboard/persons/org';
import { TurfRepo } from '@/app/utils/database/turf-repo';
import { WalkTokenRepo } from '@/app/utils/database/walk-token-repo';

export const runtime = 'nodejs';

function appBase(req: NextRequest): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.AUTH_URL ||
    process.env.NEXTAUTH_URL ||
    `${req.nextUrl.protocol}//${req.headers.get('host') || 'localhost:3000'}`
  ).replace(/\/$/, '');
}

/** GET /api/dashboard/walk-tokens?turfId= — list tokens for a turf (manager). */
export async function GET(request: NextRequest) {
  try {
    const auth = requireUserId(request);
    if (typeof auth !== 'string') return auth;
    const userId = Number(auth);
    const orgId = await ensurePrimaryOrgId(userId);
    const turfId = Number(request.nextUrl.searchParams.get('turfId'));
    if (!Number.isFinite(turfId) || turfId <= 0) {
      return NextResponse.json(
        { status: false, message: 'turfId is required' },
        { status: 400 }
      );
    }
    const turf = await TurfRepo.getById(turfId, orgId);
    if (!turf) {
      return NextResponse.json({ status: false, message: 'Turf not found' }, { status: 404 });
    }
    const tokens = await WalkTokenRepo.listByTurf(turfId, orgId);
    return NextResponse.json({
      status: true,
      tokens: tokens.map((t) => ({
        id: t.id,
        turfId: t.turf_id,
        canvasserUserId: t.canvasser_user_id,
        label: t.label,
        expiresAt: t.expires_at.toISOString(),
        revokedAt: t.revoked_at?.toISOString() ?? null,
        createdAt: t.created_at.toISOString(),
        lastUsedAt: t.last_used_at?.toISOString() ?? null,
        active: !t.revoked_at && t.expires_at.getTime() > Date.now(),
      })),
    });
  } catch (error) {
    console.error('[walk-tokens GET]', error);
    return NextResponse.json(
      { status: false, message: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/dashboard/walk-tokens — create a scoped walk link for a canvasser.
 * Body: { turfId, canvasserUserId?, expiresInDays?, label? }
 * Returns raw token once (+ share URL). Revocable from Assignments.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = requireUserId(request);
    if (typeof auth !== 'string') return auth;
    const userId = Number(auth);
    const orgId = await ensurePrimaryOrgId(userId);
    const body = await request.json();
    const turfId = Number(body.turfId);
    if (!Number.isFinite(turfId) || turfId <= 0) {
      return NextResponse.json(
        { status: false, message: 'turfId is required' },
        { status: 400 }
      );
    }
    const turf = await TurfRepo.getById(turfId, orgId);
    if (!turf) {
      return NextResponse.json({ status: false, message: 'Turf not found' }, { status: 404 });
    }

    const canvasserUserId =
      body.canvasserUserId != null
        ? Number(body.canvasserUserId)
        : turf.assigned_to != null
          ? Number(turf.assigned_to)
          : null;
    if (!canvasserUserId || !Number.isFinite(canvasserUserId)) {
      return NextResponse.json(
        {
          status: false,
          message: 'Assign a canvasser (or pass canvasserUserId) before sharing',
        },
        { status: 400 }
      );
    }

    // Keep assignment in sync when sharing
    if (turf.assigned_to !== canvasserUserId) {
      await TurfRepo.assign(turfId, orgId, canvasserUserId);
    }

    const { row, rawToken } = await WalkTokenRepo.create({
      organizationId: orgId,
      turfId,
      canvasserUserId,
      createdBy: userId,
      label: body.label ? String(body.label).trim().slice(0, 128) : turf.label,
      expiresInDays: body.expiresInDays,
    });

    const path = `/walk/${rawToken}`;
    const url = `${appBase(request)}${path}`;

    return NextResponse.json({
      status: true,
      tokenId: row.id,
      token: rawToken,
      path,
      url,
      expiresAt: row.expires_at.toISOString(),
      turfId,
      canvasserUserId,
    });
  } catch (error) {
    console.error('[walk-tokens POST]', error);
    return NextResponse.json(
      { status: false, message: error instanceof Error ? error.message : 'Create failed' },
      { status: 500 }
    );
  }
}
