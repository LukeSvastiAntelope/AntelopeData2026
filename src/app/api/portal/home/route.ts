import { NextResponse } from 'next/server';
import { requirePortalIdentity } from '@/app/utils/auth/portal-identity';
import { VolunteerShiftsRepo } from '@/app/utils/database/volunteer-shifts-repo';
import { VolunteerRelationalRepo } from '@/app/utils/database/volunteer-relational-repo';
import { VolunteerEventsRepo } from '@/app/utils/database/volunteer-events-repo';
import { VolunteerGamificationRepo } from '@/app/utils/database/volunteer-gamification-repo';

export const runtime = 'nodejs';

/** GET /api/portal/home — next shift, tasks, relational queue, points */
export async function GET() {
  try {
    const id = await requirePortalIdentity();
    if (id instanceof Response) return id;

    const [shifts, tasks, queue, points, ladder, shoutouts] = await Promise.all([
      VolunteerShiftsRepo.listShifts(id.organizationId, {
        upcomingOnly: true,
        forUserId: id.userId,
        limit: 20,
      }),
      VolunteerShiftsRepo.listTasks(id.organizationId, {
        openOnly: true,
        forUserId: id.userId,
        limit: 10,
      }),
      VolunteerRelationalRepo.listOutreachQueue({
        organizationId: id.organizationId,
        ownerUserId: id.userId,
        pendingOnly: true,
        limit: 5,
      }),
      VolunteerEventsRepo.sumPoints({
        organizationId: id.organizationId,
        userId: id.userId,
      }),
      VolunteerEventsRepo.ladderStatus({
        organizationId: id.organizationId,
        userId: id.userId,
      }),
      VolunteerGamificationRepo.listShoutouts({
        organizationId: id.organizationId,
        toUserId: id.userId,
        limit: 3,
      }),
    ]);

    const myNextShift =
      shifts.find((s) =>
        ['claimed', 'checked_in'].includes(String(s.myClaimStatus || ''))
      ) || null;
    const openToClaim = shifts
      .filter((s) => !s.myClaimStatus && s.status === 'open')
      .slice(0, 3);
    const myTasks = tasks
      .filter((t) => t.myClaimStatus === 'claimed' || !t.myClaimStatus)
      .slice(0, 5);

    return NextResponse.json({
      status: true,
      home: {
        nextShift: myNextShift,
        openShifts: openToClaim,
        tasks: myTasks,
        relationalQueue: queue,
        points,
        ladder,
        shoutouts,
      },
    });
  } catch (error) {
    console.error('[portal home GET]', error);
    return NextResponse.json(
      {
        status: false,
        message: error instanceof Error ? error.message : 'Failed',
      },
      { status: 500 }
    );
  }
}
