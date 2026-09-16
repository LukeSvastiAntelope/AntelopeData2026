import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { runConsultantMessage } from '@/app/utils/services/consultant-agent';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * POST /api/agents/consultant/message
 * Stateless-per-turn: body is the user message (+ optional conversationId/org).
 * History is loaded/saved server-side so the same agent can later power a full-screen landing.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = Number(session.user.id);
    if (!Number.isFinite(userId)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const message = String(body?.message || '').trim();
    if (!message) {
      return NextResponse.json({ error: 'Message required' }, { status: 400 });
    }

    const conversationId =
      body?.conversationId !== undefined && Number.isFinite(Number(body.conversationId))
        ? Number(body.conversationId)
        : undefined;
    const organizationId =
      body?.organizationId !== undefined && Number.isFinite(Number(body.organizationId))
        ? Number(body.organizationId)
        : null;

    const result = await runConsultantMessage({
      userId,
      organizationId,
      message,
      conversationId,
    });

    return NextResponse.json({ status: true, ...result });
  } catch (error) {
    console.error('Consultant message error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to run consultant turn',
      },
      { status: 500 }
    );
  }
}
