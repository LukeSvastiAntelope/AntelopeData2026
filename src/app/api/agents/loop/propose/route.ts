import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/app/utils/auth/require-user';
import { auth } from '@/auth';
import { runProposerPass } from '@/app/utils/services/loop/proposer';
import { resolveActiveOrgForUser } from '@/app/utils/auth/resolve-active-org';

/**
 * POST /api/agents/loop/propose
 * On-demand proposer pass (H2.2 on_demand trigger). Authenticated.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    let userId = session?.user?.id ? Number(session.user.id) : NaN;
    let headerUserId: string | null = null;
    if (!Number.isFinite(userId) || userId <= 0) {
      const authResult = requireUserId(req);
      if (typeof authResult !== 'string' || !Number.isFinite(Number(authResult))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      headerUserId = authResult;
    }
    const effectiveUserId = Number.isFinite(userId) && userId > 0
      ? userId
      : Number(headerUserId);

    const body = await req.json().catch(() => ({}));
    const orgId = await resolveActiveOrgForUser(
      req,
      effectiveUserId,
      body.orgId ?? body.organizationId
    );
    if (orgId instanceof NextResponse) return orgId;

    const result = await runProposerPass({
      orgId,
      userId: effectiveUserId,
      onDemand: true,
      force: Boolean(body.force),
    });

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error('[loop/propose] failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    );
  }
}
