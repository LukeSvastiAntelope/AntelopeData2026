import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/app/utils/auth/require-user';
import { ensurePrimaryOrgId } from '@/app/api/dashboard/persons/org';
import { LiveRepo } from '@/app/utils/database/live-repo';
import {
  computeRoomOpinionRead,
  latestRoomOpinionRead,
} from '@/app/utils/live/room-opinion-service';
import { notifyLiveSession } from '@/app/utils/live/notify';

export const runtime = 'nodejs';

/**
 * GET /api/dashboard/live/sessions/[id]/opinion-read
 * Latest persisted room opinion clusters (traceable receipts).
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
    const read = await latestRoomOpinionRead(session.id, orgId);
    return NextResponse.json({ status: true, opinionRead: read });
  } catch (error) {
    console.error('[dashboard live opinion-read GET]', error);
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
 * POST /api/dashboard/live/sessions/[id]/opinion-read
 * Recompute clusters + room summary; persists room.opinion_read event; fans out to screen.
 * body: { questionId?: number | null }
 */
export async function POST(
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
    const body = await request.json().catch(() => ({}));
    const questionId =
      body.questionId === null || body.questionId === undefined
        ? null
        : Number(body.questionId);

    const opinionRead = await computeRoomOpinionRead({
      sessionId: session.id,
      organizationId: orgId,
      questionId: Number.isFinite(questionId as number) ? questionId : null,
      persist: true,
    });

    // Invariant: every group has receipts
    for (const g of opinionRead.groups) {
      if (!g.receiptEventIds?.length) {
        return NextResponse.json(
          {
            status: false,
            message: 'Refusing to publish theme without source receipts',
          },
          { status: 500 }
        );
      }
    }

    await notifyLiveSession(session.code);
    return NextResponse.json({ status: true, opinionRead });
  } catch (error) {
    console.error('[dashboard live opinion-read POST]', error);
    return NextResponse.json(
      {
        status: false,
        message: error instanceof Error ? error.message : 'Failed',
      },
      { status: 500 }
    );
  }
}
