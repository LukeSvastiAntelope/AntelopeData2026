import { NextRequest, NextResponse } from 'next/server';
import { LiveRepo } from '@/app/utils/database/live-repo';
import { verifyParticipantToken } from '@/app/utils/live/participant-token';
import { linkedInConfigured } from '@/app/utils/live/linkedin-oidc';

export const runtime = 'nodejs';

/**
 * GET /api/public/live/[code]
 * Public session snapshot for phone join + room (intake, active question, Q&A board).
 */
export async function GET(
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
    const { session, questions } = found;
    if (session.status === 'ended') {
      return NextResponse.json(
        { status: false, message: 'This session has ended', ended: true },
        { status: 410 }
      );
    }

    const active =
      questions.find((q) => q.state === 'active') ||
      (await LiveRepo.getActiveQuestion(session.id));

    const auth = request.headers.get('x-live-participant') ||
      request.nextUrl.searchParams.get('pt');
    const claims = verifyParticipantToken(auth);
    let me: {
      participantId: number;
      displayName: string | null;
      isAnonymous: boolean;
      myAnswer: unknown | null;
    } | null = null;

    if (
      claims &&
      claims.sessionId === session.id &&
      claims.organizationId === session.organizationId
    ) {
      const p = await LiveRepo.getParticipantById(
        claims.participantId,
        session.organizationId
      );
      if (p && p.sessionId === session.id) {
        const myAnswer = active
          ? await LiveRepo.latestResponseForParticipant(
              session.id,
              session.organizationId,
              p.id,
              active.id
            )
          : null;
        me = {
          participantId: p.id,
          displayName: p.displayName,
          isAnonymous: p.isAnonymous,
          myAnswer,
        };
      }
    }

    const qa = await LiveRepo.projectQaBoard(
      session.id,
      session.organizationId
    );
    let myUpvotes = new Set<number>();
    if (me) {
      const upvoteEvents = await LiveRepo.listEvents(
        session.id,
        session.organizationId,
        { type: 'qa.upvoted', limit: 500 }
      );
      myUpvotes = new Set(
        upvoteEvents
          .filter((e) => e.participantId === me!.participantId)
          .map((e) => Number((e.payload as any)?.askEventId))
          .filter((id) => Number.isFinite(id) && id > 0)
      );
    }
    const qaWithMe = qa.map((row) => ({
      ...row,
      upvotedByMe: myUpvotes.has(row.askEventId),
    }));

    const requiresConsent =
      session.identifyMode === 'identified' ||
      session.identifyMode === 'per_question';

    return NextResponse.json({
      status: true,
      linkedInEnabled: linkedInConfigured(),
      session: {
        code: session.code,
        title: session.title,
        hostName: session.hostName,
        eventType: session.eventType,
        identifyMode: session.identifyMode,
        status: session.status,
        intakeSchema: session.intakeSchema,
        consentText:
          session.consentText ||
          session.intakeSchema.consentPrompt ||
          (requiresConsent
            ? 'Share who you are to join. Your answers may be linked to your profile for this host.'
            : null),
        requiresConsent,
      },
      activeQuestion: active
        ? {
            id: active.id,
            kind: active.kind,
            prompt: active.prompt,
            options: active.options,
            identifyOverride: active.identifyOverride,
            identifyEffective: LiveRepo.resolveIdentifyMode(session, active),
          }
        : null,
      questions: questions.map((q) => ({
        id: q.id,
        kind: q.kind,
        prompt: q.prompt,
        state: q.state,
        orderIdx: q.orderIdx,
      })),
      qa: qaWithMe,
      me,
    });
  } catch (error) {
    console.error('[public live GET]', error);
    return NextResponse.json(
      {
        status: false,
        message: error instanceof Error ? error.message : 'Failed',
      },
      { status: 500 }
    );
  }
}
