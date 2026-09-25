import { NextRequest, NextResponse } from 'next/server';
import { LiveRepo } from '@/app/utils/database/live-repo';
import { verifyHostToken } from '@/app/utils/live/host-token';
import { notifyLiveSession } from '@/app/utils/live/notify';
import { requireUserId } from '@/app/utils/auth/require-user';
import { ensurePrimaryOrgId } from '@/app/api/dashboard/persons/org';

export const runtime = 'nodejs';

/**
 * POST /api/public/live/[code]/control
 * Presenter controls: activate | queue | close | go_live | end.
 * Auth: x-live-host token OR logged-in org member (session's org).
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ code: string }> }
) {
  try {
    const { code: raw } = await context.params;
    const found = await LiveRepo.getLiveSessionByCode(raw);
    if (!found) {
      return NextResponse.json(
        { status: false, message: 'Session not found' },
        { status: 404 }
      );
    }
    const { session } = found;

    const body = await request.json().catch(() => ({}));
    const hostHeader =
      request.headers.get('x-live-host') ||
      (typeof body.hostToken === 'string' ? body.hostToken : '');
    const hostClaims = verifyHostToken(hostHeader);

    let authorized = Boolean(
      hostClaims &&
        hostClaims.sessionId === session.id &&
        hostClaims.organizationId === session.organizationId &&
        hostClaims.code === session.code
    );

    if (!authorized) {
      const auth = requireUserId(request);
      if (typeof auth === 'string') {
        const orgId = await ensurePrimaryOrgId(auth);
        if (orgId === session.organizationId) authorized = true;
      }
    }

    if (!authorized) {
      return NextResponse.json(
        { status: false, message: 'Host authorization required' },
        { status: 401 }
      );
    }

    const action = String(body.action || '');
    let result: unknown = null;

    if (action === 'go_live') {
      result = await LiveRepo.updateSession(session.id, session.organizationId, {
        status: 'live',
      });
    } else if (action === 'end') {
      result = await LiveRepo.updateSession(session.id, session.organizationId, {
        status: 'ended',
      });
    } else if (
      action === 'activate' ||
      action === 'queue' ||
      action === 'close'
    ) {
      const questionId = Number(body.questionId);
      if (!Number.isFinite(questionId)) {
        return NextResponse.json(
          { status: false, message: 'questionId required' },
          { status: 400 }
        );
      }
      const state =
        action === 'activate'
          ? 'active'
          : action === 'queue'
            ? 'queued'
            : 'closed';
      result = await LiveRepo.setQuestionState({
        sessionId: session.id,
        organizationId: session.organizationId,
        questionId,
        state,
      });
    } else if (action === 'add_question') {
      result = await LiveRepo.addQuestion({
        sessionId: session.id,
        organizationId: session.organizationId,
        kind: body.kind || 'poll',
        prompt: String(body.prompt || ''),
        options: body.options,
        identifyOverride: body.identifyOverride ?? null,
      });
    } else {
      return NextResponse.json(
        { status: false, message: 'Unknown action' },
        { status: 400 }
      );
    }

    await notifyLiveSession(session.code);
    const snapshot = await LiveRepo.buildScreenSnapshot(session.code);

    return NextResponse.json({ status: true, result, snapshot });
  } catch (error) {
    console.error('[public live control]', error);
    return NextResponse.json(
      {
        status: false,
        message: error instanceof Error ? error.message : 'Control failed',
      },
      { status: 500 }
    );
  }
}
