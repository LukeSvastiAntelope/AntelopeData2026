import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/app/utils/auth/require-user';
import { ensurePrimaryOrgId } from '@/app/api/dashboard/persons/org';
import { isStaffRole } from '@/app/utils/database/volunteer-repo';
import { VolunteerEventsRepo } from '@/app/utils/database/volunteer-events-repo';
import { VolunteerGamificationRepo } from '@/app/utils/database/volunteer-gamification-repo';
import { openSql } from '@/app/utils/database/db';
import type { RowDataPacket } from 'mysql2/promise';

export const runtime = 'nodejs';

async function assertStaff(orgId: number, userId: number) {
  const sql = await openSql();
  const [rows] = await sql.execute<RowDataPacket[]>(
    `SELECT role FROM organization_members
     WHERE organization_id = ? AND user_id = ? AND status = 'active' LIMIT 1`,
    [orgId, userId]
  );
  return rows.length > 0 && isStaffRole(String(rows[0].role));
}

/** GET /api/dashboard/volunteers/gamification */
export async function GET(request: NextRequest) {
  try {
    const auth = requireUserId(request);
    if (typeof auth !== 'string') return auth;
    const orgId = await ensurePrimaryOrgId(auth);
    if (!(await assertStaff(orgId, Number(auth)))) {
      return NextResponse.json(
        { status: false, message: 'Staff only' },
        { status: 403 }
      );
    }

    const sinceDays = Number(
      request.nextUrl.searchParams.get('sinceDays') || 30
    );

    const [leaderboard, teams, teamBoard, shoutouts] = await Promise.all([
      VolunteerEventsRepo.leaderboard({
        organizationId: orgId,
        sinceDays,
        limit: 25,
      }),
      VolunteerGamificationRepo.listTeams({ organizationId: orgId }),
      VolunteerGamificationRepo.teamLeaderboard({
        organizationId: orgId,
        sinceDays,
      }),
      VolunteerGamificationRepo.listShoutouts({
        organizationId: orgId,
        limit: 15,
      }),
    ]);

    // Attach ladder status for top board
    const withLadder = await Promise.all(
      leaderboard.slice(0, 15).map(async (row) => ({
        ...row,
        ladder: await VolunteerEventsRepo.ladderStatus({
          organizationId: orgId,
          userId: row.userId,
        }),
      }))
    );

    return NextResponse.json({
      status: true,
      leaderboard: withLadder,
      teams,
      teamBoard,
      shoutouts,
    });
  } catch (error) {
    console.error('[dashboard volunteers gamification GET]', error);
    return NextResponse.json(
      {
        status: false,
        message: error instanceof Error ? error.message : 'Failed',
      },
      { status: 500 }
    );
  }
}

/**
 * POST — create_team | shoutout
 */
export async function POST(request: NextRequest) {
  try {
    const auth = requireUserId(request);
    if (typeof auth !== 'string') return auth;
    const userId = Number(auth);
    const orgId = await ensurePrimaryOrgId(auth);
    if (!(await assertStaff(orgId, userId))) {
      return NextResponse.json(
        { status: false, message: 'Staff only' },
        { status: 403 }
      );
    }
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || '');

    if (action === 'create_team') {
      const team = await VolunteerGamificationRepo.createTeam({
        organizationId: orgId,
        createdBy: userId,
        name: String(body.name || ''),
        description: body.description ?? null,
      });
      return NextResponse.json({ status: true, team });
    }

    if (action === 'shoutout') {
      const shoutout = await VolunteerGamificationRepo.createShoutout({
        organizationId: orgId,
        fromUserId: userId,
        toUserId: Number(body.toUserId),
        message: String(body.message || ''),
      });
      return NextResponse.json({
        status: true,
        shoutout,
        message: 'Shoutout posted',
      });
    }

    return NextResponse.json(
      { status: false, message: 'Unknown action' },
      { status: 400 }
    );
  } catch (error) {
    console.error('[dashboard volunteers gamification POST]', error);
    return NextResponse.json(
      {
        status: false,
        message: error instanceof Error ? error.message : 'Failed',
      },
      { status: 500 }
    );
  }
}
