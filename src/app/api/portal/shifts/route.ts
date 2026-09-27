import { NextRequest, NextResponse } from 'next/server';
import { requirePortalIdentity } from '@/app/utils/auth/portal-identity';
import { VolunteerShiftsRepo } from '@/app/utils/database/volunteer-shifts-repo';
import { VolunteerEventsRepo } from '@/app/utils/database/volunteer-events-repo';

export const runtime = 'nodejs';

/** GET /api/portal/shifts — browse open/upcoming shifts */
export async function GET() {
  try {
    const id = await requirePortalIdentity();
    if (id instanceof Response) return id;
    const shifts = await VolunteerShiftsRepo.listShifts(id.organizationId, {
      upcomingOnly: true,
      forUserId: id.userId,
      limit: 100,
    });
    return NextResponse.json({ status: true, shifts });
  } catch (error) {
    console.error('[portal shifts GET]', error);
    return NextResponse.json(
      {
        status: false,
        message: error instanceof Error ? error.message : 'Failed',
      },
      { status: 500 }
    );
  }
}

/** POST /api/portal/shifts — claim | unclaim | check_in */
export async function POST(request: NextRequest) {
  try {
    const id = await requirePortalIdentity();
    if (id instanceof Response) return id;
    const body = await request.json().catch(() => ({}));
    const shiftId = Number(body.shiftId);
    if (!Number.isFinite(shiftId)) {
      return NextResponse.json(
        { status: false, message: 'shiftId required' },
        { status: 400 }
      );
    }
    const action = String(body.action || 'claim');
    let shift;
    if (action === 'unclaim') {
      shift = await VolunteerShiftsRepo.unclaimShift({
        shiftId,
        organizationId: id.organizationId,
        userId: id.userId,
      });
    } else if (action === 'check_in') {
      shift = await VolunteerShiftsRepo.checkIn({
        shiftId,
        organizationId: id.organizationId,
        userId: id.userId,
      });
      await VolunteerEventsRepo.append({
        organizationId: id.organizationId,
        userId: id.userId,
        kind: 'shift_checked_in',
        relatedType: 'shift',
        relatedId: shiftId,
      });
    } else {
      shift = await VolunteerShiftsRepo.claimShift({
        shiftId,
        organizationId: id.organizationId,
        userId: id.userId,
        personRecordId: id.personRecordId,
      });
      await VolunteerEventsRepo.append({
        organizationId: id.organizationId,
        userId: id.userId,
        kind: 'shift_claimed',
        points: 0,
        relatedType: 'shift',
        relatedId: shiftId,
      });
    }
    return NextResponse.json({ status: true, shift });
  } catch (error) {
    console.error('[portal shifts POST]', error);
    return NextResponse.json(
      {
        status: false,
        message: error instanceof Error ? error.message : 'Failed',
      },
      { status: 500 }
    );
  }
}
