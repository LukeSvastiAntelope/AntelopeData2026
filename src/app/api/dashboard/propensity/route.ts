import { NextRequest, NextResponse } from 'next/server';
import { PropensityRepo } from '@/app/utils/database/propensity-repo';
import { ensurePrimaryOrgId } from '@/app/api/dashboard/persons/org';
import type { PropensityTier } from '@/app/utils/propensity/config';

export const runtime = 'nodejs';

function csvList(v: string | null): string[] | undefined {
  if (!v) return undefined;
  const parts = v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts : undefined;
}

function parseTiers(v: string | null): PropensityTier[] | undefined {
  const list = csvList(v);
  if (!list) return undefined;
  const tiers = list.filter((t): t is PropensityTier => t === 'hot' || t === 'warm' || t === 'cold');
  return tiers.length ? tiers : undefined;
}

/** GET /api/dashboard/propensity — funnel + who-to-work + optional tier list. */
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
    }
    const orgId = await ensurePrimaryOrgId(userId);
    const sp = request.nextUrl.searchParams;
    const tier = parseTiers(sp.get('tier'));
    const includeList = sp.get('list') === '1';
    const whoNext = sp.get('whoNext') === '1' || sp.get('who_next') === '1';
    const excludeSuppressed =
      sp.get('excludeSuppressed') === '1' ||
      sp.get('excludeSuppressed') === 'true' ||
      sp.get('notDnc') === '1';
    const includeAreas = csvList(sp.get('includeArea') || sp.get('includeAreas'));

    const summary = await PropensityRepo.funnelSummary(orgId);
    const payload: Record<string, unknown> = {
      status: true,
      organizationId: orgId,
      summary,
      note: 'Materialized propensity view — recomputed from engagement; not a frozen score.',
    };

    if (whoNext) {
      payload.whoToWork = await PropensityRepo.whoToWorkNext(orgId, {
        tier: tier?.length === 1 ? tier[0] : tier,
        excludeSuppressed: excludeSuppressed || undefined,
        includeFenceLabels: includeAreas,
        limit: Number(sp.get('limit') || 40),
        openOnly: sp.get('openOnly') !== '0',
      });
    }

    if (includeList) {
      payload.voters = await PropensityRepo.listByOrg(orgId, {
        tier: tier?.length === 1 ? tier[0] : tier,
        excludeSuppressed: excludeSuppressed || undefined,
        includeFenceLabels: includeAreas,
        limit: Number(sp.get('limit') || 200),
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
