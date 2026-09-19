import { NextRequest, NextResponse } from 'next/server';
import { PropensityRepo } from '@/app/utils/database/propensity-repo';
import { ensurePrimaryOrgId } from '@/app/api/dashboard/persons/org';
import type { PropensityTier } from '@/app/utils/propensity/config';

export const runtime = 'nodejs';

/** GET /api/dashboard/propensity — funnel summary + optional tier list. */
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
    }
    const orgId = await ensurePrimaryOrgId(userId);
    const tier = request.nextUrl.searchParams.get('tier') as PropensityTier | null;
    const includeList = request.nextUrl.searchParams.get('list') === '1';

    const summary = await PropensityRepo.funnelSummary(orgId);
    const payload: Record<string, unknown> = {
      status: true,
      organizationId: orgId,
      summary,
      note: 'Materialized propensity view — recomputed from engagement; not a frozen score.',
    };

    if (includeList) {
      payload.voters = await PropensityRepo.listByOrg(orgId, {
        tier: tier || undefined,
        limit: Number(request.nextUrl.searchParams.get('limit') || 200),
      });
    }

    return NextResponse.json(payload);
  } catch (error) {
    console.error('[propensity GET]', error);
    return NextResponse.json(
      { status: false, message: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}

/** POST /api/dashboard/propensity — refresh materialized view for org (or one person). */
export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
    }
    const orgId = await ensurePrimaryOrgId(userId);
    const body = await request.json().catch(() => ({}));

    if (body.personRecordId) {
      const row = await PropensityRepo.refreshPerson(Number(body.personRecordId), orgId);
      if (!row) {
        return NextResponse.json({ status: false, message: 'Person not found' }, { status: 404 });
      }
      return NextResponse.json({ status: true, refreshed: 1, row });
    }

    const result = await PropensityRepo.refreshOrganization(orgId, {
      limit: body.limit || 2000,
    });
    const summary = await PropensityRepo.funnelSummary(orgId);
    return NextResponse.json({
      status: true,
      ...result,
      summary,
      note: 'voter_propensity refreshed — materialized view, not ballistic storage',
    });
  } catch (error) {
    console.error('[propensity POST]', error);
    return NextResponse.json(
      { status: false, message: error instanceof Error ? error.message : 'Refresh failed' },
      { status: 500 }
    );
  }
}
