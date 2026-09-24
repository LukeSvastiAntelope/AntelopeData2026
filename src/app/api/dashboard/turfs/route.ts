import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/app/utils/auth/require-user';
import {
  TurfRepo,
  filtersFromSegmentId,
  mergeFilters,
  queryTurfAddresses,
  type TurfDefinition,
  type TurfFilters,
} from '@/app/utils/database/turf-repo';
import { ensurePrimaryOrgId } from '@/app/api/dashboard/persons/org';

export const runtime = 'nodejs';

/** GET /api/dashboard/turfs — list saved turfs (optional ?assignedTo=me|<userId>, ?coverage=1). */
export async function GET(request: NextRequest) {
  try {
    const auth = requireUserId(request);
    if (typeof auth !== 'string') return auth;
    const userId = Number(auth);
    const orgId = await ensurePrimaryOrgId(userId);
    const assignedRaw = request.nextUrl.searchParams.get('assignedTo');
    let turfs;
    if (assignedRaw) {
      const assignedTo =
        assignedRaw === 'me' ? Number(userId) : Number(assignedRaw);
      if (!Number.isFinite(assignedTo) || assignedTo <= 0) {
        return NextResponse.json(
          { status: false, message: 'assignedTo must be me or a user id' },
          { status: 400 }
        );
      }
      turfs = await TurfRepo.listByAssignee(orgId, assignedTo);
    } else {
      turfs = await TurfRepo.list(orgId);
    }

    if (request.nextUrl.searchParams.get('coverage') === '1') {
      const coverage = await TurfRepo.coverageCounts(orgId);
      return NextResponse.json({
        status: true,
        organizationId: orgId,
        turfs: turfs.map((t) => ({
          ...t,
          contacted_count: coverage.get(t.id) || 0,
        })),
      });
    }
    return NextResponse.json({ status: true, organizationId: orgId, turfs });
  } catch (error) {
    console.error('[turfs GET]', error);
    return NextResponse.json(
      { status: false, message: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/dashboard/turfs — build & save a turf (or preview with previewOnly).
 * Body mirrors build_turf tool inputs.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = requireUserId(request);
    if (typeof auth !== 'string') return auth;
    const userId = Number(auth);
    const orgId = await ensurePrimaryOrgId(userId);
    const body = await request.json();
    const label = String(body.label || '').trim();
    if (!label) {
      return NextResponse.json({ status: false, message: 'label is required' }, { status: 400 });
    }

    const fromSegment = filtersFromSegmentId(body.segmentId);
    const filters: TurfFilters = mergeFilters(fromSegment, {
      party: body.party || body.filters?.party,
      minPartisanScore: body.minPartisanScore ?? body.filters?.minPartisanScore,
      maxPartisanScore: body.maxPartisanScore ?? body.filters?.maxPartisanScore,
      minTurnoutScore: body.minTurnoutScore ?? body.filters?.minTurnoutScore,
      maxTurnoutScore: body.maxTurnoutScore ?? body.filters?.maxTurnoutScore,
      zip: body.zip || body.filters?.zip,
      segmentId: body.segmentId,
      ...(body.filters || {}),
    });

    const definition: TurfDefinition = body.definition || {
      includeFenceLabels: body.includeAreas,
      excludeFenceLabels: body.excludeAreas,
      includeFenceIds: body.includeFenceIds,
      excludeFenceIds: body.excludeFenceIds,
      filters,
      excludeSuppressed: body.excludeSuppressed !== false,
      excludeContacted: body.excludeContacted === true,
      limit: body.limit || 5000,
    };

    if (body.previewOnly) {
      const addresses = await queryTurfAddresses(orgId, definition);
      return NextResponse.json({
        status: true,
        preview: true,
        count: addresses.length,
        definition,
        addresses,
      });
    }

    const { turf, addresses } = await TurfRepo.build({
      organizationId: orgId,
      createdBy: Number(userId),
      label,
      definition,
      assignedTo: body.assignedTo ?? null,
      notes: body.notes ?? null,
    });

    return NextResponse.json({ status: true, turf, count: addresses.length, addresses });
  } catch (error) {
    console.error('[turfs POST]', error);
    return NextResponse.json(
      { status: false, message: error instanceof Error ? error.message : 'Build failed' },
      { status: 500 }
    );
  }
}
