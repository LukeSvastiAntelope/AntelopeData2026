import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/app/utils/auth/require-user';
import { ensurePrimaryOrgId } from '@/app/api/dashboard/persons/org';
import { LiveRepo, type LiveQuestionKind } from '@/app/utils/database/live-repo';
import { issueHostToken } from '@/app/utils/live/host-token';

export const runtime = 'nodejs';

/** GET /api/dashboard/live/sessions — list org sessions (?status=) */
export async function GET(request: NextRequest) {
  try {
    const auth = requireUserId(request);
    if (typeof auth !== 'string') return auth;
    const orgId = await ensurePrimaryOrgId(auth);
    const statusParam = request.nextUrl.searchParams.get('status');
    const statuses = statusParam
      ? (statusParam.split(',').map((s) => s.trim()).filter(Boolean) as any)
      : undefined;
    const sessions = await LiveRepo.listSessions(orgId, {
      limit: 100,
      status: statuses?.length === 1 ? statuses[0] : statuses,
    });
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

/**
 * POST /api/dashboard/live/sessions — create session with intake + question deck.
 * body: title, hostName, eventType, identifyMode, intakeSchema, consentText,
 *       questions[], goLive?, scheduledAt?, status?
 */
export async function POST(request: NextRequest) {
  try {
    const auth = requireUserId(request);
    if (typeof auth !== 'string') return auth;
    const userId = Number(auth);
    const orgId = await ensurePrimaryOrgId(auth);
    const body = await request.json().catch(() => ({}));

    let status = body.status;
    if (body.goLive) status = 'live';
    else if (body.scheduledAt && !status) status = 'scheduled';

    const session = await LiveRepo.createSession({
      organizationId: orgId,
      createdBy: userId,
      title: String(body.title || 'Untitled session'),
      hostName: body.hostName ?? null,
      eventType: body.eventType,
      identifyMode: body.identifyMode,
      intakeSchema: body.intakeSchema ?? { fields: [] },
      consentText:
        body.consentText ??
        body.intakeSchema?.consentPrompt ??
        null,
      status,
      scheduledAt: body.scheduledAt ?? null,
    });

    const questionsIn = Array.isArray(body.questions) ? body.questions : [];
    const createdQuestions = [];
    for (let i = 0; i < questionsIn.length; i++) {
      const q = questionsIn[i];
      if (!q?.prompt) continue;
      const kind = (q.kind || 'poll') as LiveQuestionKind;
      const question = await LiveRepo.addQuestion({
        sessionId: session.id,
        organizationId: orgId,
        kind,
        prompt: String(q.prompt),
        options: q.options,
        identifyOverride: q.identifyOverride ?? null,
        orderIdx: q.orderIdx != null ? Number(q.orderIdx) : i,
        state: q.state || 'queued',
      });
      createdQuestions.push(question);
    }

    const refreshed = await LiveRepo.getSessionById(session.id, orgId);
    const hostToken = issueHostToken({
      sessionId: session.id,
      organizationId: orgId,
      code: (refreshed || session).code,
    });
    const code = (refreshed || session).code;

    return NextResponse.json({
      status: true,
      session: refreshed || session,
      questions: createdQuestions,
      hostToken,
      screenPath: `/live/${code}/screen?ht=${encodeURIComponent(hostToken)}`,
      joinPath: `/live/${code}`,
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
