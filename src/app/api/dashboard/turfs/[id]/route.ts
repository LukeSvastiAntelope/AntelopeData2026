import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/app/utils/auth/require-user';
import { TurfRepo, type TurfStopStatus } from '@/app/utils/database/turf-repo';
import { ensurePrimaryOrgId } from '@/app/api/dashboard/persons/org';

export const runtime = 'nodejs';

/** GET /api/dashboard/turfs/[id] — turf detail; ?addresses=1 returns walk-list + field outcomes. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireUserId(request);
    if (typeof auth !== 'string') return auth;
    const userId = Number(auth);
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

/** PATCH — assign canvasser and/or record a stop outcome. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireUserId(request);
    if (typeof auth !== 'string') return auth;
    const userId = Number(auth);
    const orgId = await ensurePrimaryOrgId(userId);
    const { id: idRaw } = await params;
    const id = Number(idRaw);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ status: false, message: 'Invalid id' }, { status: 400 });
    }

    const body = await request.json();

    if (body.voterGeoId != null && body.status) {
      const result = await TurfRepo.recordStop({
        organizationId: orgId,
        turfId: id,
        voterGeoId: Number(body.voterGeoId),
        recordedBy: Number(userId),
        status: String(body.status) as TurfStopStatus,
        party: body.party ?? null,
        notes: body.notes ?? null,
        surveyResponseId: body.surveyResponseId != null ? Number(body.surveyResponseId) : null,
        recordedAt: body.recordedAt ?? null,
        clientEventId: body.clientEventId ?? null,
      });
      return NextResponse.json({ status: true, ...result });
    }

    if ('assignedTo' in body || body.unassign || body.assignToSelf) {
      const assignedTo = body.unassign
        ? null
        : body.assignToSelf
          ? Number(userId)
          : body.assignedTo != null
            ? Number(body.assignedTo)
            : Number(userId);
      const turf = await TurfRepo.assign(id, orgId, assignedTo);
      if (!turf) {
        return NextResponse.json({ status: false, message: 'Not found' }, { status: 404 });
      }
      return NextResponse.json({ status: true, turf });
    }

    return NextResponse.json(
      { status: false, message: 'Provide assignedTo/unassign or voterGeoId+status' },
      { status: 400 }
    );
  } catch (error) {
    console.error('[turfs/:id PATCH]', error);
    return NextResponse.json(
      { status: false, message: error instanceof Error ? error.message : 'Update failed' },
      { status: 500 }
    );
  }
}

/** DELETE — remove saved turf (+ cascaded walk-list + outcomes). */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireUserId(request);
    if (typeof auth !== 'string') return auth;
    const userId = Number(auth);
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
