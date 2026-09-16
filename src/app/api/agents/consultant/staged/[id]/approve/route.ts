import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { approveStagedAction } from '@/app/utils/services/consultant-agent';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/agents/consultant/staged/[id]/approve
 * Human confirmation path — only place that runs approval-risk tools.
 */
export async function POST(_request: Request, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = Number(session.user.id);
    if (!Number.isFinite(userId)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const stagedActionId = Number(id);
    if (!Number.isFinite(stagedActionId) || stagedActionId <= 0) {
      return NextResponse.json({ error: 'Invalid staged action id' }, { status: 400 });
    }

    const result = await approveStagedAction({ userId, stagedActionId });
    return NextResponse.json({
      status: true,
      staged: result.staged,
      conversation: result.conversation,
      execution: result.execution,
    });
  } catch (error) {
    console.error('Staged approve error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Approve failed' },
      { status: 400 }
    );
  }
}
