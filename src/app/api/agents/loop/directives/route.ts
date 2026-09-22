import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/app/utils/auth/require-user';
import { auth } from '@/auth';
import { AgentSituationService } from '@/app/utils/services/agent-situation-service';

/**
 * POST /api/agents/loop/directives
 * H2.5 — capture human steering as first-class situation state
 * (e.g. "focus on housing, not childcare"), not just approve/dismiss flags.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    let userId = session?.user?.id ? Number(session.user.id) : NaN;
    if (!Number.isFinite(userId) || userId <= 0) {
      const authResult = requireUserId(req);
      userId = typeof authResult === 'string' ? Number(authResult) : NaN;
    }
    if (!Number.isFinite(userId) || userId <= 0) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const orgId = Number(body.orgId ?? body.organizationId);
    const text = String(body.text || body.directive || '').trim();
    if (!Number.isFinite(orgId) || orgId <= 0) {
      return NextResponse.json({ error: 'orgId is required' }, { status: 400 });
    }
    if (!text) {
      return NextResponse.json({ error: 'text is required' }, { status: 400 });
    }

    const doc = await AgentSituationService.recordHumanDirective({
      orgId,
      text,
      source: `user:${userId}`,
    });

    return NextResponse.json({
      ok: true,
      version: doc.version,
      humanDirectives: doc.snapshot.humanDirectives,
    });
  } catch (error) {
    console.error('[loop/directives] failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    );
  }
}
