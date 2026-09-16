import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getConsultantConversationState } from '@/app/utils/services/consultant-agent';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/agents/consultant/conversation
 * Returns the user's consultant conversation + pending staged actions.
 */
export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = Number(session.user.id);
    if (!Number.isFinite(userId)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const orgParam = url.searchParams.get('organizationId');
    const organizationId =
      orgParam !== null && Number.isFinite(Number(orgParam)) ? Number(orgParam) : null;

    const state = await getConsultantConversationState({ userId, organizationId });
    return NextResponse.json({ status: true, ...state });
  } catch (error) {
    console.error('Consultant conversation GET error:', error);
    // Tables may not exist yet — return soft empty so UI still mounts
    const message = error instanceof Error ? error.message : 'Failed to load conversation';
    if (/consultant_conversations|doesn't exist|ER_NO_SUCH_TABLE/i.test(message)) {
      return NextResponse.json({
        status: true,
        conversation: null,
        stagedActions: [],
        needsMigration: true,
        warning: message,
      });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
