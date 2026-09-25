import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/app/utils/auth/require-user';
import { ensurePrimaryOrgId } from '@/app/api/dashboard/persons/org';
import { getParticipantDrawer } from '@/app/utils/live/audience-intelligence';

export const runtime = 'nodejs';

/** GET /api/dashboard/live/sessions/[id]/participants/[pid] */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string; pid: string }> }
) {
  try {
    const auth = requireUserId(request);
    if (typeof auth !== 'string') return auth;
    const orgId = await ensurePrimaryOrgId(auth);
    const { id, pid } = await context.params;
    const data = await getParticipantDrawer({
      sessionId: Number(id),
      organizationId: orgId,
      participantId: Number(pid),
    });
    return NextResponse.json({ status: true, ...data });
  } catch (error) {
    console.error('[dashboard live participant drawer]', error);
    return NextResponse.json(
      {
        status: false,
        message: error instanceof Error ? error.message : 'Failed',
      },
      { status: 500 }
    );
  }
}
