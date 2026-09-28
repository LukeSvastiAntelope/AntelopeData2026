import { NextRequest, NextResponse } from 'next/server';
import {
  requireSuperAdmin,
  clientIp,
} from '@/app/utils/auth/require-super-admin';
import { writeAdminAuditLog } from '@/app/utils/database/admin-audit-repo';
import { AntelopeGrowthRepo } from '@/app/utils/database/antelope-growth-repo';
import {
  getOrCreateGrowthChannel,
  stageAntelopeMarketingDraft,
} from '@/app/utils/services/antelope-growth-service';

/**
 * GET /api/admin/growth — channel + drafts
 * POST /api/admin/growth — generate/stage a draft (never posts)
 */
export async function GET(req: NextRequest) {
  try {
    const gate = await requireSuperAdmin(req);
    if (gate instanceof NextResponse) return gate;

    const channel = await getOrCreateGrowthChannel();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || undefined;
    const drafts = await AntelopeGrowthRepo.listDrafts({
      status: status
        ? (status.split(',') as any)
        : undefined,
      limit: 50,
    });
    const pendingCount = await AntelopeGrowthRepo.countPending();

    await writeAdminAuditLog({
      actorUserId: gate.numericUserId,
      action: 'growth.list',
      targetType: 'growth',
      metadata: { pendingCount, draftCount: drafts.length },
      ip: clientIp(req),
    });

    return NextResponse.json({
      status: true,
      channel,
      drafts,
      pendingCount,
    });
  } catch (error) {
    console.error('[admin/growth GET]', error);
    return NextResponse.json(
      {
        status: false,
        message: error instanceof Error ? error.message : 'Failed',
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const gate = await requireSuperAdmin(req);
    if (gate instanceof NextResponse) return gate;

    const body = await req.json().catch(() => ({}));
    const hasBody = Boolean(body.body && String(body.body).trim());
    const generate = body.generate === true || !hasBody;
    const result = await stageAntelopeMarketingDraft({
      actorUserId: gate.numericUserId,
      body: hasBody ? String(body.body) : null,
      topic: body.topic || null,
      tone: body.tone || null,
      source: hasBody && body.generate !== true ? 'manual' : 'agent',
      generate,
    });

    await writeAdminAuditLog({
      actorUserId: gate.numericUserId,
      action: 'growth.draft_stage',
      targetType: 'growth_draft',
      targetId: result.draft.id,
      metadata: {
        source: result.draft.source,
        stagedActionId: result.stagedActionId,
        generatedVia: result.generatedVia || null,
        topic: result.draft.topic,
      },
      ip: clientIp(req),
    });

    return NextResponse.json(
      {
        status: true,
        draft: result.draft,
        stagedActionId: result.stagedActionId,
        note: 'Staged for approval — nothing was posted to X.',
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[admin/growth POST]', error);
    return NextResponse.json(
      {
        status: false,
        message: error instanceof Error ? error.message : 'Failed',
      },
      { status: 500 }
    );
  }
}
