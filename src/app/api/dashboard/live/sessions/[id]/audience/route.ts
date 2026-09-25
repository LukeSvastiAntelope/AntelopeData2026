import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/app/utils/auth/require-user';
import { ensurePrimaryOrgId } from '@/app/api/dashboard/persons/org';
import { listAudienceParticipants } from '@/app/utils/live/audience-intelligence';

export const runtime = 'nodejs';

/** GET /api/dashboard/live/sessions/[id]/audience */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireUserId(request);
    if (typeof auth !== 'string') return auth;
    const orgId = await ensurePrimaryOrgId(auth);
    const { id } = await context.params;
    const data = await listAudienceParticipants(Number(id), orgId);
    return NextResponse.json({ status: true, ...data });
  } catch (error) {
    console.error('[dashboard live audience]', error);
    return NextResponse.json(
      {
        status: false,
        message: error instanceof Error ? error.message : 'Failed',
      },
      { status: 500 }
    );
  }
}
