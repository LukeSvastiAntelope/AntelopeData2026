import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/app/utils/auth/require-user';
import { ensurePrimaryOrgId } from '@/app/api/dashboard/persons/org';
import { LiveRepo } from '@/app/utils/database/live-repo';
import { issueHostToken } from '@/app/utils/live/host-token';
import { notifyLiveSession } from '@/app/utils/live/notify';

export const runtime = 'nodejs';

/** GET /api/dashboard/live/sessions/[id] */
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
    const questions = await LiveRepo.listQuestions(session.id);
    const participantCount = await LiveRepo.countParticipants(
      session.id,
      orgId
    );
    const hostToken = issueHostToken({
      sessionId: session.id,
      organizationId: orgId,
      code: session.code,
    });
    return NextResponse.json({
      status: true,
      session,
      questions,
      participantCount,
      hostToken,
      joinPath: `/live/${session.code}`,
      screenPath: `/live/${session.code}/screen?ht=${encodeURIComponent(hostToken)}`,
    });
  } catch (error) {
    console.error('[dashboard live session GET]', error);
    return NextResponse.json(
      {
        status: false,
        message: error instanceof Error ? error.message : 'Failed',
      },
      { status: 500 }
    );
  }
}

/** PATCH /api/dashboard/live/sessions/[id] */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireUserId(request);
    if (typeof auth !== 'string') return auth;
    const orgId = await ensurePrimaryOrgId(auth);
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const session = await LiveRepo.updateSession(Number(id), orgId, body);
    await notifyLiveSession(session.code);
    return NextResponse.json({ status: true, session });
  } catch (error) {
    console.error('[dashboard live session PATCH]', error);
    return NextResponse.json(
      {
        status: false,
        message: error instanceof Error ? error.message : 'Failed',
      },
      { status: 500 }
    );
  }
}
