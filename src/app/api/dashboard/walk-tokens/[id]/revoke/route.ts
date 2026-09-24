import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/app/utils/auth/require-user';
import { ensurePrimaryOrgId } from '@/app/api/dashboard/persons/org';
import { WalkTokenRepo } from '@/app/utils/database/walk-token-repo';

export const runtime = 'nodejs';

/** POST /api/dashboard/walk-tokens/[id]/revoke — revoke a walk link. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireUserId(request);
    if (typeof auth !== 'string') return auth;
    const userId = Number(auth);
    const orgId = await ensurePrimaryOrgId(userId);
    const { id: idRaw } = await params;
    const id = Number(idRaw);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ status: false, message: 'Invalid id' }, { status: 400 });
    }
    const token = await WalkTokenRepo.revoke(id, orgId);
    if (!token) {
      return NextResponse.json({ status: false, message: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({
      status: true,
      token: {
        id: token.id,
        revokedAt: token.revoked_at?.toISOString() ?? null,
        active: false,
      },
    });
  } catch (error) {
    console.error('[walk-tokens revoke]', error);
    return NextResponse.json(
      { status: false, message: error instanceof Error ? error.message : 'Revoke failed' },
      { status: 500 }
    );
  }
}
