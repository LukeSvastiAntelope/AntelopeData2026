import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getOrgUsageSummary } from '@/app/utils/database/ai-usage-repo';
import {
  AI_PLAN_ALLOWANCES,
  AI_PLAN_LABELS,
  defaultRateTable,
  isAiUsageHardEnforce,
} from '@/app/utils/services/ai-usage-config';
import { resolveActiveOrgForUser } from '@/app/utils/auth/resolve-active-org';

export const dynamic = 'force-dynamic';

/**
 * GET /api/ai/usage — current org AI credit meter for the signed-in campaign.
 * Reads the same org requests are charged to (session/active via H1 helper).
 */
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { status: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const orgId = await resolveActiveOrgForUser(req, session.user.id);
    if (orgId instanceof NextResponse) return orgId;

    const summary = await getOrgUsageSummary(orgId);

    return NextResponse.json({
      status: true,
      usage: summary,
      organizationId: orgId,
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
