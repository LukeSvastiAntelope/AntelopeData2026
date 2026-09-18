import { NextRequest, NextResponse } from 'next/server';
import { GeofenceRepo } from '@/app/utils/database/geo-repo';
import { ensurePrimaryOrgId } from '@/app/api/dashboard/persons/org';
import type { GeofencePurpose, GeofenceType } from '@/app/utils/database/geo-repo';

export const runtime = 'nodejs';

/** GET /api/dashboard/geofences — list saved fences for the campaign org. */
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
    }
    const orgId = await ensurePrimaryOrgId(userId);
    const fences = await GeofenceRepo.list(orgId);
    return NextResponse.json({ status: true, organizationId: orgId, fences });
  } catch (error) {
    console.error('[geofences GET]', error);
    return NextResponse.json(
      { status: false, message: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/dashboard/geofences — create a saved labeled fence.
 * Body: { label, fenceType?, purpose?, ring?, centerLat?, centerLng?, radiusM?, color?, notes? }
 * ring is MapLibre [[lng,lat],...] — converted to MySQL 4326 lat-lng WKT server-side.
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

    const fenceType = (body.fenceType || 'polygon') as GeofenceType;
    const purpose = (body.purpose ||
      (body.mode === 'exclude' ? 'exclude' : 'include')) as GeofencePurpose;

    const fence = await GeofenceRepo.create({
      organizationId: orgId,
      createdBy: Number(userId),
      label,
      fenceType,
      purpose,
      ring: body.ring,
      centerLat: body.centerLat ?? null,
      centerLng: body.centerLng ?? null,
      radiusM: body.radiusM ?? null,
      color: body.color ?? null,
      notes: body.notes ?? null,
    });

    return NextResponse.json({ status: true, fence });
  } catch (error) {
    console.error('[geofences POST]', error);
    return NextResponse.json(
      { status: false, message: error instanceof Error ? error.message : 'Create failed' },
      { status: 500 }
    );
  }
}
