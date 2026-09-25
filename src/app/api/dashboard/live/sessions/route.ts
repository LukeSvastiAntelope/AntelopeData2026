import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/app/utils/auth/require-user';
import { ensurePrimaryOrgId } from '@/app/api/dashboard/persons/org';
import { LiveRepo } from '@/app/utils/database/live-repo';
import { issueHostToken } from '@/app/utils/live/host-token';

export const runtime = 'nodejs';

/** GET /api/dashboard/live/sessions — list org sessions */
export async function GET(request: NextRequest) {
  try {
    const auth = requireUserId(request);
    if (typeof auth !== 'string') return auth;
    const orgId = await ensurePrimaryOrgId(auth);
    const sessions = await LiveRepo.listSessions(orgId, { limit: 100 });
    return NextResponse.json({ status: true, organizationId: orgId, sessions });
  } catch (error) {
    console.error('[dashboard live sessions GET]', error);
    return NextResponse.json(
      {
        status: false,
        message: error instanceof Error ? error.message : 'Failed',
      },
      { status: 500 }
    );
  }
}

/** POST /api/dashboard/live/sessions — create session */
export async function POST(request: NextRequest) {
  try {
    const auth = requireUserId(request);
    if (typeof auth !== 'string') return auth;
    const userId = Number(auth);
    const orgId = await ensurePrimaryOrgId(auth);
    const body = await request.json().catch(() => ({}));

    const session = await LiveRepo.createSession({
      organizationId: orgId,
      createdBy: userId,
      title: String(body.title || 'Untitled session'),
      hostName: body.hostName ?? null,
      eventType: body.eventType,
      identifyMode: body.identifyMode,
      intakeSchema: body.intakeSchema ?? { fields: [] },
      consentText: body.consentText ?? null,
    });

    if (body.goLive) {
      await LiveRepo.updateSession(session.id, orgId, { status: 'live' });
    }

    const refreshed = await LiveRepo.getSessionById(session.id, orgId);
    const hostToken = issueHostToken({
      sessionId: session.id,
      organizationId: orgId,
      code: session.code,
    });

    return NextResponse.json({
      status: true,
      session: refreshed || session,
      hostToken,
      screenPath: `/live/${session.code}/screen?ht=${encodeURIComponent(hostToken)}`,
      joinPath: `/live/${session.code}`,
    });
  } catch (error) {
    console.error('[dashboard live sessions POST]', error);
    return NextResponse.json(
      {
        status: false,
        message: error instanceof Error ? error.message : 'Failed',
      },
      { status: 500 }
    );
  }
}
