import { NextRequest, NextResponse } from 'next/server';
import {
  requireSuperAdmin,
  clientIp,
} from '@/app/utils/auth/require-super-admin';
import { writeAdminAuditLog } from '@/app/utils/database/admin-audit-repo';
import {
  getOrgUsageSummary,
  listOrgUsageSummaries,
  setOrgAiPlan,
} from '@/app/utils/database/ai-usage-repo';
import {
  AI_PLAN_ALLOWANCES,
  AI_PLAN_LABELS,
  defaultRateTable,
  isAiPlanTier,
  isAiUsageHardEnforce,
} from '@/app/utils/services/ai-usage-config';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/ai-usage — cross-org AI credit usage (super-admin).
 */
export async function GET(req: NextRequest) {
  try {
    const gate = await requireSuperAdmin(req);
    if (gate instanceof NextResponse) return gate;

    const url = new URL(req.url);
    const orgId = Number(url.searchParams.get('orgId') || 0);

    await writeAdminAuditLog({
      actorUserId: gate.numericUserId,
      action: 'ai_usage.list',
      targetType: orgId > 0 ? 'org' : 'platform',
      targetId: orgId > 0 ? orgId : null,
      metadata: {},
      ip: clientIp(req),
    });

    if (orgId > 0) {
      const usage = await getOrgUsageSummary(orgId);
      return NextResponse.json({
        status: true,
        usage,
        plans: AI_PLAN_ALLOWANCES,
        planLabels: AI_PLAN_LABELS,
        hardEnforce: isAiUsageHardEnforce(),
        rates: defaultRateTable(),
      });
    }

    const orgs = await listOrgUsageSummaries(300);
    const totals = orgs.reduce(
      (acc, o) => {
        acc.usedCredits += o.usedCredits;
        acc.callCount += o.callCount;
        acc.costUsd += o.costUsd;
        return acc;
      },
      { usedCredits: 0, callCount: 0, costUsd: 0 }
    );

    return NextResponse.json({
      status: true,
      orgs,
      totals: {
        usedCredits: Math.round(totals.usedCredits * 100) / 100,
        callCount: totals.callCount,
        costUsd: Math.round(totals.costUsd * 1e6) / 1e6,
        orgCount: orgs.length,
      },
      plans: AI_PLAN_ALLOWANCES,
      planLabels: AI_PLAN_LABELS,
      hardEnforce: isAiUsageHardEnforce(),
      rates: defaultRateTable(),
    });
  } catch (error) {
    console.error('[admin/ai-usage]', error);
    return NextResponse.json(
      {
        status: false,
        message: error instanceof Error ? error.message : 'Failed',
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/ai-usage — set an org's AI plan tier / allowance override.
 * Body: { organizationId, planTier, allowanceOverride? }
 */
export async function PATCH(req: NextRequest) {
  try {
    const gate = await requireSuperAdmin(req);
    if (gate instanceof NextResponse) return gate;

    const body = await req.json().catch(() => ({}));
    const organizationId = Number(body.organizationId ?? body.orgId);
    const planTier = body.planTier ?? body.plan;
    const allowanceOverride =
      body.allowanceOverride === null || body.allowanceOverride === ''
        ? null
        : body.allowanceOverride != null
          ? Number(body.allowanceOverride)
          : undefined;

    if (!Number.isFinite(organizationId) || organizationId <= 0) {
      return NextResponse.json(
        { status: false, message: 'organizationId is required' },
        { status: 400 }
      );
    }
    if (!isAiPlanTier(planTier)) {
      return NextResponse.json(
        {
          status: false,
          message: 'planTier must be grassroots | campaign | congressional',
        },
        { status: 400 }
      );
    }

    await setOrgAiPlan({
      organizationId,
      planTier,
      allowanceOverride:
        allowanceOverride === undefined ? undefined : allowanceOverride,
    });

    await writeAdminAuditLog({
      actorUserId: gate.numericUserId,
      action: 'ai_usage.set_plan',
      targetType: 'org',
      targetId: organizationId,
      metadata: { planTier, allowanceOverride: allowanceOverride ?? null },
      ip: clientIp(req),
    });

    const usage = await getOrgUsageSummary(organizationId);
    return NextResponse.json({ status: true, usage });
  } catch (error) {
    console.error('[admin/ai-usage PATCH]', error);
    return NextResponse.json(
      {
        status: false,
        message: error instanceof Error ? error.message : 'Failed',
      },
      { status: 500 }
    );
  }
}
