import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isPortalRole } from '@/app/utils/database/volunteer-repo';
import { VolunteerShiftsRepo } from '@/app/utils/database/volunteer-shifts-repo';

export const runtime = 'nodejs';

function portalIdentity(session: any) {
  const userId = Number(session?.user?.id);
  const organizationId = Number(session?.user?.organizationId);
  const personRecordId =
    session?.user?.personRecordId != null
      ? Number(session.user.personRecordId)
      : null;
  const orgRole = session?.user?.orgRole as string | null;
  if (!isPortalRole(orgRole) || !organizationId || !userId) return null;
  return { userId, organizationId, personRecordId };
}

/** GET /api/portal/shifts — browse open/upcoming shifts */
export async function GET() {
  try {
    const session = await auth();
    const id = portalIdentity(session);
    if (!id) {
      return NextResponse.json(
        { status: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }
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
    const session = await auth();
    const id = portalIdentity(session);
    if (!id) {
      return NextResponse.json(
        { status: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }
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
    } else {
      shift = await VolunteerShiftsRepo.claimShift({
        shiftId,
        organizationId: id.organizationId,
        userId: id.userId,
        personRecordId: id.personRecordId,
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
