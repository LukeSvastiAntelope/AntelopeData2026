import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { ensurePrimaryOrgId } from '@/app/api/dashboard/persons/org';
import { getOrgUsageSummary } from '@/app/utils/database/ai-usage-repo';
import {
  AI_PLAN_ALLOWANCES,
  AI_PLAN_LABELS,
  defaultRateTable,
  isAiUsageHardEnforce,
} from '@/app/utils/services/ai-usage-config';

export const dynamic = 'force-dynamic';

/**
 * GET /api/ai/usage — current org AI credit meter for the signed-in campaign.
 */
export async function GET(_req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { status: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const orgId = await ensurePrimaryOrgId(session.user.id);
    const summary = await getOrgUsageSummary(orgId);

    return NextResponse.json({
      status: true,
      usage: summary,
      plans: AI_PLAN_ALLOWANCES,
      planLabels: AI_PLAN_LABELS,
      hardEnforce: isAiUsageHardEnforce(),
      rates: defaultRateTable(),
    });
  } catch (error) {
    console.error('[api/ai/usage]', error);
    return NextResponse.json(
      {
        status: false,
        message:
          error instanceof Error ? error.message : 'Failed to load AI usage',
      },
      { status: 500 }
    );
  }
}
