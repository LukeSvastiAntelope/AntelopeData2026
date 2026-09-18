import { NextRequest, NextResponse } from 'next/server';
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

/** GET /api/dashboard/turfs — list saved turfs. */
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
    }
    const orgId = await ensurePrimaryOrgId(userId);
    const turfs = await TurfRepo.list(orgId);
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
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
    }
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
