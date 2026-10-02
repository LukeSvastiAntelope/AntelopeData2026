import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { requireUserId } from '@/app/utils/auth/require-user';
import { withUserOrgAiUsage } from '@/app/utils/services/with-org-ai-usage';
import { generateAnalysisContentDrafts } from '@/app/utils/services/analysis-content-service';
import { AnalyticsContentDraftRepo } from '@/app/utils/database/analytics-content-draft-repo';
import { WorkflowRepo } from '@/app/utils/database/workflow-repo';
import { resolveActiveOrgForUser } from '@/app/utils/auth/resolve-active-org';

/**
 * POST /api/analytics/to-content — synthesis + figures → 3 Spread drafts
 * GET  /api/analytics/to-content — list drafts for Spread inbox
 * PATCH /api/analytics/to-content — mark draft used / dismissed / staged
 */
async function resolveUserId(req: NextRequest): Promise<number> {
  const session = await auth();
  let userId = session?.user?.id ? Number(session.user.id) : NaN;
  if (!Number.isFinite(userId)) {
    const authResult = requireUserId(req);
    userId = typeof authResult === 'string' ? Number(authResult) : NaN;
  }
  return userId;
}

export async function GET(req: NextRequest) {
  try {
    const userId = await resolveUserId(req);
    if (!Number.isFinite(userId) || userId <= 0) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const idParam = req.nextUrl.searchParams.get('id');
    if (idParam) {
      const id = Number(idParam);
      if (!Number.isFinite(id) || id <= 0) {
        return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
      }
      const draft = await AnalyticsContentDraftRepo.getById(id, userId);
      if (!draft) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }
      try {
        // Opening a draft consumes it for Campaign Flow (used), while still
        // returning the payload for Video Studio / composer prefill.
        await AnalyticsContentDraftRepo.markUsed(id, userId);
      } catch {
        /* non-fatal */
      }
      const refreshed = await AnalyticsContentDraftRepo.getById(id, userId);
      return NextResponse.json({ status: true, draft: refreshed || draft });
    }
    const drafts = await AnalyticsContentDraftRepo.listForUser(userId, {
      limit: 50,
    });
    return NextResponse.json({ status: true, drafts });
  } catch (error) {
    console.error('[analytics/to-content GET]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'List failed' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const userId = await resolveUserId(req);
    if (!Number.isFinite(userId) || userId <= 0) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = await req.json().catch(() => ({}));
    const id = Number(body.id);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }
    const status = String(body.status || '').trim();
    if (!['used', 'dismissed', 'staged', 'opened'].includes(status)) {
      return NextResponse.json(
        { error: 'status must be used | dismissed | staged | opened' },
        { status: 400 }
      );
    }
    const existing = await AnalyticsContentDraftRepo.getById(id, userId);
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const draft = await AnalyticsContentDraftRepo.setStatus(
      id,
      userId,
      status as 'used' | 'dismissed' | 'staged' | 'opened'
    );
    return NextResponse.json({ status: true, draft });
  } catch (error) {
    console.error('[analytics/to-content PATCH]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Update failed' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await resolveUserId(req);
    if (!Number.isFinite(userId) || userId <= 0) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const synthesis = String(body.synthesis || '').trim();
    if (!synthesis) {
      return NextResponse.json({ error: 'synthesis is required' }, { status: 400 });
    }

    const figures = Array.isArray(body.figures) ? body.figures : [];
    const organizationId = await resolveActiveOrgForUser(
      req,
      userId,
      body.organizationId
    );
    if (organizationId instanceof NextResponse) return organizationId;

    const result = await withUserOrgAiUsage(
      userId,
      'analytics.to_content',
      () =>
        generateAnalysisContentDrafts({
          userId,
          organizationId,
          conversationId: body.conversationId ? String(body.conversationId) : null,
          surveyId:
            body.surveyId != null && Number.isFinite(Number(body.surveyId))
              ? Number(body.surveyId)
              : null,
          surveyTitle: body.surveyTitle ? String(body.surveyTitle) : null,
          synthesis,
          figures,
          // sampleN from client is intentionally ignored — server recomputes
          testName: body.testName ? String(body.testName) : null,
          pValue:
            body.pValue != null && Number.isFinite(Number(body.pValue))
              ? Number(body.pValue)
              : null,
        }),
      organizationId
    );

    // Campaign flow: after analysis → content, nudge Next to Spread
    try {
      await WorkflowRepo.nudgeAfterAnalysisContent(userId);
    } catch (e) {
      console.warn(
        '[analytics/to-content] workflow nudge failed',
        e instanceof Error ? e.message : e
      );
    }

    return NextResponse.json({
      status: true,
      bundle: result.bundle,
      drafts: result.drafts,
      sampleN: result.sampleN,
      stats: result.stats,
    });
  } catch (error) {
    console.error('[analytics/to-content POST]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Generation failed' },
      { status: 500 }
    );
  }
}
