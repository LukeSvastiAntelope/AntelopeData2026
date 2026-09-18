import { NextRequest, NextResponse } from 'next/server';
import { TurfRepo } from '@/app/utils/database/turf-repo';
import { ensurePrimaryOrgId } from '@/app/api/dashboard/persons/org';

export const runtime = 'nodejs';

/** GET /api/dashboard/turfs/[id] — turf detail; ?addresses=1 returns walk-list. */
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
      const result = await TurfRepo.listAddresses(id, orgId, {
        limit: Number(request.nextUrl.searchParams.get('limit') || 5000),
        offset: Number(request.nextUrl.searchParams.get('offset') || 0),
      });
      return NextResponse.json({
        status: true,
        turf: result.turf,
        count: result.addresses.length,
        addresses: result.addresses,
      });
    }

    const turf = await TurfRepo.getById(id, orgId);
    if (!turf) {
      return NextResponse.json({ status: false, message: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ status: true, turf });
  } catch (error) {
    console.error('[turfs/:id GET]', error);
    return NextResponse.json(
      { status: false, message: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}

/** DELETE — remove saved turf (+ cascaded walk-list). */
export async function DELETE(
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
    const ok = await TurfRepo.delete(id, orgId);
    if (!ok) {
      return NextResponse.json({ status: false, message: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ status: true });
  } catch (error) {
    console.error('[turfs/:id DELETE]', error);
    return NextResponse.json(
      { status: false, message: error instanceof Error ? error.message : 'Delete failed' },
      { status: 500 }
    );
  }
}
