import { NextRequest, NextResponse } from 'next/server';
import {
  requireSuperAdmin,
  clientIp,
} from '@/app/utils/auth/require-super-admin';
import { writeAdminAuditLog } from '@/app/utils/database/admin-audit-repo';
import { AntelopeGrowthRepo } from '@/app/utils/database/antelope-growth-repo';
import {
  approveMarketingDraft,
  rejectMarketingDraft,
} from '@/app/utils/services/antelope-growth-service';

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/growth/drafts/[id]
 * body.action = approve | reject | mark_posted
 *
 * approve/reject: human gate (never posts).
 * mark_posted: only after approved — records that Luke posted manually.
 * There is no live auto-tweet path.
 */
export async function POST(req: NextRequest, context: Ctx) {
  try {
    const gate = await requireSuperAdmin(req);
    if (gate instanceof NextResponse) return gate;

    const { id: rawId } = await context.params;
    const id = Number(rawId);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json(
        { status: false, message: 'Invalid draft id' },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '').toLowerCase();

    if (action === 'approve') {
      const draft = await approveMarketingDraft(id, gate.numericUserId);
      await writeAdminAuditLog({
        actorUserId: gate.numericUserId,
        action: 'growth.draft_approve',
        targetType: 'growth_draft',
        targetId: id,
        metadata: { neverAutoPost: true },
        ip: clientIp(req),
      });
      return NextResponse.json({
        status: true,
        draft,
        note: 'Approved. Nothing was posted to X.',
      });
    }

    if (action === 'reject') {
      const draft = await rejectMarketingDraft(id, gate.numericUserId);
      await writeAdminAuditLog({
        actorUserId: gate.numericUserId,
        action: 'growth.draft_reject',
        targetType: 'growth_draft',
        targetId: id,
        ip: clientIp(req),
      });
      return NextResponse.json({ status: true, draft });
    }

    if (action === 'mark_posted') {
      const draft = await AntelopeGrowthRepo.markPosted(id, {
        externalId: body.externalId || null,
        metadata: { markedBy: gate.email },
      });
      if (!draft) {
        return NextResponse.json(
          {
            status: false,
            message: 'Draft must be approved before marking posted',
          },
          { status: 400 }
        );
      }
      await writeAdminAuditLog({
        actorUserId: gate.numericUserId,
        action: 'growth.draft_mark_posted',
        targetType: 'growth_draft',
        targetId: id,
        metadata: { externalId: body.externalId || null },
        ip: clientIp(req),
      });
      return NextResponse.json({ status: true, draft });
    }

    return NextResponse.json(
      {
        status: false,
        message: 'action must be approve | reject | mark_posted',
      },
      { status: 400 }
    );
  } catch (error) {
    console.error('[admin/growth/drafts POST]', error);
    return NextResponse.json(
      {
        status: false,
        message: error instanceof Error ? error.message : 'Failed',
      },
      { status: 500 }
    );
  }
}
