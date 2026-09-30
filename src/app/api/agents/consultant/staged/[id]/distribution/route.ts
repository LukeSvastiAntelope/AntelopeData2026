import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { ConsultantRepo } from '@/app/utils/database/consultant-repo';
import { ensurePrimaryOrgId } from '@/app/api/dashboard/persons/org';
import {
  getDistributionStatusForStaged,
  manualRetryDelivery,
} from '@/app/utils/services/distribution-webhook-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

async function requireStagedOwner(stagedActionId: number, userId: number) {
  const staged = await ConsultantRepo.getStagedActionById(stagedActionId);
  if (!staged) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  const conversation = await ConsultantRepo.assertConversationOwner(
    staged.conversationId,
    userId
  );
  if (!conversation) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 403 }) };
  }
  return { staged, conversation };
}

/**
 * GET /api/agents/consultant/staged/[id]/distribution — delivery status for approval card
 */
export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = Number(session.user.id);
    const { id } = await context.params;
    const stagedActionId = Number(id);
    if (!Number.isFinite(stagedActionId) || stagedActionId <= 0) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }

    const owned = await requireStagedOwner(stagedActionId, userId);
    if ('error' in owned && owned.error) return owned.error;

    const status = await getDistributionStatusForStaged(stagedActionId);
    return NextResponse.json({
      status: true,
      stagedActionId,
      distribution: {
        queued: status.queued,
        status: status.status,
        label: status.label,
        deliveryIds: status.deliveryIds,
        contentType: status.contentType,
      },
      deliveries: status.deliveries.map((d) => ({
        id: d.id,
        webhookId: d.webhookId,
        status: d.status,
        httpStatus: d.httpStatus,
        attempt: d.attempt,
        maxAttempts: d.maxAttempts,
        error: d.error,
        nextAttemptAt: d.nextAttemptAt,
      })),
    });
  } catch (error) {
    console.error('[staged/distribution GET]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/agents/consultant/staged/[id]/distribution — manual retry failed deliveries
 * Body: { deliveryId?: number }
 */
export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = Number(session.user.id);
    const { id } = await context.params;
    const stagedActionId = Number(id);
    if (!Number.isFinite(stagedActionId) || stagedActionId <= 0) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }

    const owned = await requireStagedOwner(stagedActionId, userId);
    if ('error' in owned && owned.error) return owned.error;

    const body = await req.json().catch(() => ({}));
    const organizationId =
      owned.conversation!.organizationId && owned.conversation!.organizationId > 0
        ? owned.conversation!.organizationId
        : await ensurePrimaryOrgId(userId);

    const result = await manualRetryDelivery({
      stagedActionId,
      organizationId,
      deliveryId:
        body.deliveryId != null && Number.isFinite(Number(body.deliveryId))
          ? Number(body.deliveryId)
          : undefined,
    });

    return NextResponse.json({
      status: true,
      distribution: {
        queued: result.queued,
        status: result.status,
        label: result.label,
        deliveryIds: result.deliveryIds,
        contentType: result.contentType,
      },
    });
  } catch (error) {
    console.error('[staged/distribution POST]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Retry failed' },
      { status: 500 }
    );
  }
}
