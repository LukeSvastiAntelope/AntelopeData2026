import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/app/utils/auth/require-user';
import { ensurePrimaryOrgId } from '@/app/api/dashboard/persons/org';
import { LiveRepo } from '@/app/utils/database/live-repo';
import { notifyLiveSession } from '@/app/utils/live/notify';

export const runtime = 'nodejs';

/** POST /api/dashboard/live/sessions/[id]/questions — add or set state */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireUserId(request);
    if (typeof auth !== 'string') return auth;
    const orgId = await ensurePrimaryOrgId(auth);
    const { id } = await context.params;
    const sessionId = Number(id);
    const session = await LiveRepo.getSessionById(sessionId, orgId);
    if (!session) {
      return NextResponse.json(
        { status: false, message: 'Session not found' },
        { status: 404 }
      );
    }
    const body = await request.json().catch(() => ({}));

    if (body.action === 'set_state') {
      const q = await LiveRepo.setQuestionState({
        sessionId,
        organizationId: orgId,
        questionId: Number(body.questionId),
        state: body.state,
      });
      await notifyLiveSession(session.code);
      return NextResponse.json({ status: true, question: q });
    }

    const question = await LiveRepo.addQuestion({
      sessionId,
      organizationId: orgId,
      kind: body.kind || 'poll',
      prompt: String(body.prompt || ''),
      options: body.options,
      identifyOverride: body.identifyOverride ?? null,
    });
    await notifyLiveSession(session.code);
    return NextResponse.json({ status: true, question });
  } catch (error) {
    console.error('[dashboard live questions]', error);
    return NextResponse.json(
      {
        status: false,
        message: error instanceof Error ? error.message : 'Failed',
      },
      { status: 500 }
    );
  }
}
