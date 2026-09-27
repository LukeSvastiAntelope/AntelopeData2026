import { NextRequest, NextResponse } from 'next/server';
import { requirePortalIdentity } from '@/app/utils/auth/portal-identity';
import { VolunteerEventsRepo } from '@/app/utils/database/volunteer-events-repo';
import { VolunteerGamificationRepo } from '@/app/utils/database/volunteer-gamification-repo';

export const runtime = 'nodejs';

/** GET /api/portal/points — my points, ladder, leaderboard, teams, shoutouts */
export async function GET() {
  try {
    const id = await requirePortalIdentity();
    if (id instanceof Response) return id;

    const [points, ladder, leaderboard, teams, shoutouts, recent] =
      await Promise.all([
        VolunteerEventsRepo.sumPoints({
          organizationId: id.organizationId,
          userId: id.userId,
        }),
        VolunteerEventsRepo.ladderStatus({
          organizationId: id.organizationId,
          userId: id.userId,
        }),
        VolunteerEventsRepo.leaderboard({
          organizationId: id.organizationId,
          sinceDays: 30,
          limit: 10,
        }),
        VolunteerGamificationRepo.listTeams({
          organizationId: id.organizationId,
          forUserId: id.userId,
        }),
        VolunteerGamificationRepo.listShoutouts({
          organizationId: id.organizationId,
          toUserId: id.userId,
          limit: 10,
        }),
        VolunteerEventsRepo.listForUser({
          organizationId: id.organizationId,
          userId: id.userId,
          limit: 15,
        }),
      ]);

    const myRank =
      leaderboard.findIndex((r) => r.userId === id.userId) + 1 || null;

    return NextResponse.json({
      status: true,
      points,
      ladder,
      myRank,
      leaderboard,
      teams,
      shoutouts,
      recent,
    });
  } catch (error) {
    console.error('[portal points GET]', error);
    return NextResponse.json(
      {
        status: false,
        message: error instanceof Error ? error.message : 'Failed',
      },
      { status: 500 }
    );
  }
}

/** POST /api/portal/points — join_team | leave_team */
export async function POST(request: NextRequest) {
  try {
    const id = await requirePortalIdentity();
    if (id instanceof Response) return id;
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || '');

    if (action === 'join_team') {
      const teamId = Number(body.teamId);
      if (!Number.isFinite(teamId)) {
        return NextResponse.json(
          { status: false, message: 'teamId required' },
          { status: 400 }
        );
      }
      await VolunteerGamificationRepo.joinTeam({
        teamId,
        organizationId: id.organizationId,
        userId: id.userId,
      });
      return NextResponse.json({ status: true, message: 'Joined team' });
    }

    if (action === 'leave_team') {
      await VolunteerGamificationRepo.leaveTeam({
        organizationId: id.organizationId,
        userId: id.userId,
      });
      return NextResponse.json({ status: true, message: 'Left team' });
    }

    return NextResponse.json(
      { status: false, message: 'Unknown action' },
      { status: 400 }
    );
  } catch (error) {
    console.error('[portal points POST]', error);
    return NextResponse.json(
      {
        status: false,
        message: error instanceof Error ? error.message : 'Failed',
      },
      { status: 500 }
    );
  }
}
