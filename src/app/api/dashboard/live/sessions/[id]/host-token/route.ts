import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/app/utils/auth/require-user';
import { ensurePrimaryOrgId } from '@/app/api/dashboard/persons/org';
import { LiveRepo } from '@/app/utils/database/live-repo';
import { issueHostToken } from '@/app/utils/live/host-token';

export const runtime = 'nodejs';

/**
 * GET /api/dashboard/live/sessions/[id]/host-token
 * Issue a presenter host token for /live/[code]/screen?ht=…
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireUserId(request);
    if (typeof auth !== 'string') return auth;
    const orgId = await ensurePrimaryOrgId(auth);
    const { id } = await context.params;
    const session = await LiveRepo.getSessionById(Number(id), orgId);
    if (!session) {
      return NextResponse.json(
        { status: false, message: 'Session not found' },
        { status: 404 }
      );
    }
    const hostToken = issueHostToken({
      sessionId: session.id,
      organizationId: session.organizationId,
      code: session.code,
    });
    return NextResponse.json({
      status: true,
      hostToken,
      screenPath: `/live/${session.code}/screen?ht=${encodeURIComponent(hostToken)}`,
      code: session.code,
    });
  } catch (error) {
    console.error('[dashboard live host-token]', error);
    return NextResponse.json(
      {
        status: false,
        message: error instanceof Error ? error.message : 'Failed',
      },
      { status: 500 }
    );
  }
}
