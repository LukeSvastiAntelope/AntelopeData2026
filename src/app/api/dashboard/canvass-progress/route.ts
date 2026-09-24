import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/app/utils/auth/require-user';
import { ensurePrimaryOrgId } from '@/app/api/dashboard/persons/org';
import { TurfRepo } from '@/app/utils/database/turf-repo';

export const runtime = 'nodejs';

/**
 * GET /api/dashboard/canvass-progress
 * MiniVAN M4 — near-real-time Ground Game snapshot for managers (poll every few seconds).
 * Returns coverage %, outcome breakdown, and last-synced timestamps per turf.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = requireUserId(request);
    if (typeof auth !== 'string') return auth;
    const userId = Number(auth);
    const orgId = await ensurePrimaryOrgId(userId);
    const progress = await TurfRepo.liveProgress(orgId);
    return NextResponse.json({
      status: true,
      organizationId: orgId,
      ...progress,
    });
  } catch (error) {
    console.error('[canvass-progress GET]', error);
    return NextResponse.json(
      { status: false, message: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}
