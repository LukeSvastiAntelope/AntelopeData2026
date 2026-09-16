import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { WorkflowRepo } from '@/app/utils/database/workflow-repo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = parseInt(session.user.id, 10);
    if (!Number.isFinite(userId)) {
      return NextResponse.json({ error: 'Invalid session user' }, { status: 400 });
    }

    try {
      const progress = await WorkflowRepo.getProgress(userId);
      return NextResponse.json({ status: true, progress });
    } catch (error: any) {
      // Table may not exist yet in some environments — never block the sidebar.
      console.warn('Workflow progress unavailable:', error?.message || error);
      return NextResponse.json({
        status: true,
        progress: {
          userId,
          currentStage: 'plan',
          completedStages: [],
          recommendedNext: 'plan',
          updatedAt: null,
        },
        warning: 'Workflow progress table not ready; using defaults.',
      });
    }
  } catch (error) {
    console.error('Workflow progress route error:', error);
    return NextResponse.json({ error: 'Failed to load workflow progress' }, { status: 500 });
  }
}
