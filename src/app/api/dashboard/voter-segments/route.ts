import { NextRequest, NextResponse } from 'next/server';
import { ensurePrimaryOrgId } from '@/app/api/dashboard/persons/org';
import {
  listSegmentCatalog,
  listSavedSegments,
  saveVoterSegment,
  type VoterSegmentDefinition,
} from '@/app/utils/services/voter-segments';

export const runtime = 'nodejs';

/**
 * GET /api/dashboard/voter-segments — catalog (tracked presets + saved) for org.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
    }
    const orgId = await ensurePrimaryOrgId(userId);
    const catalog = await listSegmentCatalog(orgId);
    const saved = await listSavedSegments(orgId);

    return NextResponse.json({
      status: true,
      organizationId: orgId,
      catalog,
      saved,
      disclaimer:
        'Segments are live filters over observed map + survey-stated attributes — not persuasion scores.',
    });
  } catch (error) {
    console.error('[voter-segments GET]', error);
    return NextResponse.json(
      { status: false, message: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/dashboard/voter-segments — save a named live segment definition.
 * Body: { name, description?, definition, slug? }
 */
export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
    }
    const orgId = await ensurePrimaryOrgId(userId);
    const body = await request.json().catch(() => ({}));
    const name = String(body?.name || '').trim();
    if (!name) {
      return NextResponse.json({ status: false, message: 'name required' }, { status: 400 });
    }
    const definition = (body?.definition || {}) as VoterSegmentDefinition;
    if (!definition || typeof definition !== 'object') {
      return NextResponse.json(
        { status: false, message: 'definition object required' },
        { status: 400 }
      );
    }

    const saved = await saveVoterSegment({
      organizationId: orgId,
      name,
      description: body?.description ?? null,
      definition,
      slug: body?.slug,
      createdBy: Number(userId),
    });

    return NextResponse.json({ status: true, segment: saved });
  } catch (error) {
    console.error('[voter-segments POST]', error);
    return NextResponse.json(
      { status: false, message: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}
