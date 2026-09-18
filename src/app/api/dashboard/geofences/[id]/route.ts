import { NextRequest, NextResponse } from 'next/server';
import { GeofenceRepo, addressesInFence } from '@/app/utils/database/geo-repo';
import { ensurePrimaryOrgId } from '@/app/api/dashboard/persons/org';

export const runtime = 'nodejs';

/** GET /api/dashboard/geofences/[id] — fence detail; ?addresses=1 runs spatial query. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
    }
    const orgId = await ensurePrimaryOrgId(userId);
    const { id: idRaw } = await params;
    const id = Number(idRaw);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ status: false, message: 'Invalid id' }, { status: 400 });
    }

    if (request.nextUrl.searchParams.get('addresses') === '1') {
      const result = await addressesInFence(id, orgId, {
        limit: Number(request.nextUrl.searchParams.get('limit') || 5000),
      });
      return NextResponse.json({
        status: true,
        fence: result.fence,
        count: result.addresses.length,
        addresses: result.addresses,
      });
    }

    const fence = await GeofenceRepo.getById(id, orgId);
    if (!fence) {
      return NextResponse.json({ status: false, message: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ status: true, fence });
  } catch (error) {
    console.error('[geofences/:id GET]', error);
    return NextResponse.json(
      { status: false, message: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}

/** PATCH — rename / update-geometry / purpose / notes / color */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
    }
    const orgId = await ensurePrimaryOrgId(userId);
    const { id: idRaw } = await params;
    const id = Number(idRaw);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ status: false, message: 'Invalid id' }, { status: 400 });
    }

    const body = await request.json();
    let fence = await GeofenceRepo.getById(id, orgId);
    if (!fence) {
      return NextResponse.json({ status: false, message: 'Not found' }, { status: 404 });
    }

    if (body.label) {
      fence = await GeofenceRepo.rename(id, orgId, String(body.label));
    }
    if (body.ring || body.centerLat != null || body.radiusM != null) {
      fence = await GeofenceRepo.updateGeometry(id, orgId, {
        ring: body.ring,
        centerLat: body.centerLat,
        centerLng: body.centerLng,
        radiusM: body.radiusM,
        fenceType: body.fenceType,
      });
    }

    return NextResponse.json({ status: true, fence });
  } catch (error) {
    console.error('[geofences/:id PATCH]', error);
    return NextResponse.json(
      { status: false, message: error instanceof Error ? error.message : 'Update failed' },
      { status: 500 }
    );
  }
}

/** DELETE */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = _request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
    }
    const orgId = await ensurePrimaryOrgId(userId);
    const { id: idRaw } = await params;
    const id = Number(idRaw);
    const ok = await GeofenceRepo.delete(id, orgId);
    if (!ok) {
      return NextResponse.json({ status: false, message: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ status: true });
  } catch (error) {
    console.error('[geofences/:id DELETE]', error);
    return NextResponse.json(
      { status: false, message: error instanceof Error ? error.message : 'Delete failed' },
      { status: 500 }
    );
  }
}
