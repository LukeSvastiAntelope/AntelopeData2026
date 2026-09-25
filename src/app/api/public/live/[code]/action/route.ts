import { NextRequest, NextResponse } from 'next/server';
import { LiveRepo } from '@/app/utils/database/live-repo';
import { verifyParticipantToken } from '@/app/utils/live/participant-token';

export const runtime = 'nodejs';

/**
 * POST /api/public/live/[code]/action
 * Participant actions → append-only session_events.
 * body.action: answer | ask | upvote
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
    const token =
      request.headers.get('x-live-participant') ||
      (typeof body.participantToken === 'string' ? body.participantToken : '');
    const claims = verifyParticipantToken(token);
    if (
      !claims ||
      claims.sessionId !== session.id ||
      claims.organizationId !== session.organizationId
    ) {
      return NextResponse.json(
        { status: false, message: 'Join this session first' },
        { status: 401 }
      );
    }

    const action = String(body.action || '');
    let event;

    if (action === 'answer') {
      const questionId = Number(body.questionId);
      if (!Number.isFinite(questionId)) {
        return NextResponse.json(
          { status: false, message: 'questionId required' },
          { status: 400 }
        );
      }
      event = await LiveRepo.recordResponse({
        sessionId: session.id,
        organizationId: session.organizationId,
        participantId: claims.participantId,
        questionId,
        value: body.value,
      });
    } else if (action === 'ask') {
      event = await LiveRepo.askQa({
        sessionId: session.id,
        organizationId: session.organizationId,
        participantId: claims.participantId,
        text: String(body.text || ''),
        questionId: body.questionId != null ? Number(body.questionId) : null,
      });
    } else if (action === 'upvote') {
      const askEventId = Number(body.askEventId);
      if (!Number.isFinite(askEventId)) {
        return NextResponse.json(
          { status: false, message: 'askEventId required' },
          { status: 400 }
        );
      }
      event = await LiveRepo.upvoteQa({
        sessionId: session.id,
        organizationId: session.organizationId,
        participantId: claims.participantId,
        askEventId,
      });
    } else {
      return NextResponse.json(
        { status: false, message: 'Unknown action' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      status: true,
      event: {
        id: event.id,
        type: event.type,
        createdAt: event.createdAt,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Action failed';
    const status =
      message.includes('Already') || message.includes('not active')
        ? 409
        : 400;
    console.error('[public live action]', error);
    return NextResponse.json({ status: false, message }, { status });
  }
}
