import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { dismissStagedAction } from '@/app/utils/services/consultant-agent';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/agents/consultant/staged/[id]/dismiss
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

    const staged = await dismissStagedAction({ userId, stagedActionId });
    return NextResponse.json({ status: true, staged });
  } catch (error) {
    console.error('Staged dismiss error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Dismiss failed' },
      { status: 400 }
    );
  }
}
