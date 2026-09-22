import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/app/utils/auth/require-user';
import { ensurePrimaryOrgId } from '@/app/api/dashboard/persons/org';
import {
  LoopConfigRepo,
  type LoopAutonomy,
  type LoopBudgetsConfig,
  type LoopMemoryConfig,
  type LoopTriggersConfig,
} from '@/app/utils/database/loop-config-repo';

export const runtime = 'nodejs';

/** GET /api/agents/loop/config — governor settings for the command point. */
export async function GET(request: NextRequest) {
  try {
    const auth = requireUserId(request);
    if (typeof auth !== 'string') return auth;
    const userId = Number(auth);
    const orgId = await ensurePrimaryOrgId(userId);
    const config = await LoopConfigRepo.getOrCreate({
      userId: Number(userId),
      organizationId: orgId,
    });
    return NextResponse.json({
      status: true,
      organizationId: orgId,
      config,
      invariant:
        'Autonomy governs only auto-risk tools. Approval tools (send/publish/charge) never auto-run.',
    });
  } catch (error) {
    console.error('[loop/config GET]', error);
    return NextResponse.json(
      { status: false, message: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}

/** PATCH /api/agents/loop/config — edit loop_config from the command point. */
export async function PATCH(request: NextRequest) {
  try {
    const auth = requireUserId(request);
    if (typeof auth !== 'string') return auth;
    const userId = Number(auth);
    const orgId = await ensurePrimaryOrgId(userId);
    const body = await request.json().catch(() => ({}));

    const autonomy = body.autonomy as LoopAutonomy | undefined;
    if (
      autonomy &&
      autonomy !== 'manual' &&
      autonomy !== 'propose' &&
      autonomy !== 'auto_within_limits'
    ) {
      return NextResponse.json({ status: false, message: 'Invalid autonomy' }, { status: 400 });
    }

    const config = await LoopConfigRepo.update(
      { userId: Number(userId), organizationId: orgId },
      {
        autonomy,
        memory: body.memory as Partial<LoopMemoryConfig> | undefined,
        triggers: body.triggers as Partial<LoopTriggersConfig> | undefined,
        budgets: body.budgets as Partial<LoopBudgetsConfig> | undefined,
      }
    );

    return NextResponse.json({
      status: true,
      organizationId: orgId,
      config,
      invariant:
        'Saved. Note: even auto_within_limits cannot promote approval tools — sends stay gated.',
    });
  } catch (error) {
    console.error('[loop/config PATCH]', error);
    return NextResponse.json(
      { status: false, message: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}
