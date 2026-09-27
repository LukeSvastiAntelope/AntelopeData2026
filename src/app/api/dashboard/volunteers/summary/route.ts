import { NextResponse } from 'next/server';
import { requireUserId } from '@/app/utils/auth/require-user';
import { ensurePrimaryOrgId } from '@/app/api/dashboard/persons/org';
import { isStaffRole } from '@/app/utils/database/volunteer-repo';
import { VolunteerRepo } from '@/app/utils/database/volunteer-repo';
import { VolunteerShiftsRepo } from '@/app/utils/database/volunteer-shifts-repo';
import { VolunteerEventsRepo } from '@/app/utils/database/volunteer-events-repo';
import { VolunteerRelationalRepo } from '@/app/utils/database/volunteer-relational-repo';
import { openSql } from '@/app/utils/database/db';
import type { RowDataPacket } from 'mysql2/promise';

export const runtime = 'nodejs';

/**
 * GET /api/dashboard/volunteers/summary
 * Staff volunteer strength: active count, shift coverage, leaderboard, retention.
 */
export async function GET(request: Request) {
  try {
    const auth = requireUserId(request as any);
    if (typeof auth !== 'string') return auth;
    const orgId = await ensurePrimaryOrgId(auth);
    const sql = await openSql();
    const [mem] = await sql.execute<RowDataPacket[]>(
      `SELECT role FROM organization_members
       WHERE organization_id = ? AND user_id = ? AND status = 'active' LIMIT 1`,
      [orgId, Number(auth)]
    );
    if (!mem.length || !isStaffRole(String(mem[0].role))) {
      return NextResponse.json(
        { status: false, message: 'Staff only' },
        { status: 403 }
      );
    }

    const roster = await VolunteerRepo.listVolunteers(orgId, { limit: 500 });
    const activeVolunteers = roster.filter((v) => v.status === 'active').length;
    const pendingVolunteers = roster.filter((v) => v.status === 'pending')
      .length;

    const shifts = await VolunteerShiftsRepo.listShifts(orgId, {
      upcomingOnly: true,
      limit: 50,
    });
    const openShifts = shifts.filter((s) =>
      ['open', 'full'].includes(s.status)
    );
    const covered = openShifts.filter(
      (s) =>
        s.claimCount > 0 &&
        (s.capacity == null || s.claimCount >= Math.ceil(s.capacity * 0.5))
    ).length;
    const underfilled = openShifts.filter(
      (s) =>
        s.capacity != null && s.claimCount < Math.ceil(s.capacity * 0.5)
    ).length;
    const totalSlots = openShifts.reduce(
      (acc, s) => acc + (s.capacity ?? Math.max(s.claimCount, 1)),
      0
    );
    const claimedSlots = openShifts.reduce((acc, s) => acc + s.claimCount, 0);

    const [retention, leaderboard, reach] = await Promise.all([
      VolunteerEventsRepo.retentionMetric(orgId),
      VolunteerEventsRepo.leaderboard({
        organizationId: orgId,
        sinceDays: 30,
        limit: 5,
      }),
      VolunteerRelationalRepo.orgReachStats(orgId),
    ]);

    // Retention rate: active30d / total active volunteers (the number that should go up)
    const retentionRate =
      retention.totalVolunteers > 0
        ? Math.round(
            (retention.active30d / retention.totalVolunteers) * 1000
          ) / 10
        : 0;

    return NextResponse.json({
      status: true,
      summary: {
        activeVolunteers,
        pendingVolunteers,
        totalVolunteers: roster.length,
        shifts: {
          upcoming: openShifts.length,
          covered,
          underfilled,
          claimedSlots,
          totalSlots,
          coveragePct:
            totalSlots > 0
              ? Math.round((claimedSlots / totalSlots) * 1000) / 10
              : 0,
        },
        retention: {
          ...retention,
          /** Active-through-time: share of roster active in last 30d */
          retentionRate30d: retentionRate,
        },
        leaderboard,
        reach: {
          reached: reach.reached,
          converted: reach.converted,
          volunteersWithNetwork: reach.volunteersWithNetwork,
        },
      },
    });
  } catch (error) {
    console.error('[dashboard volunteers summary]', error);
    return NextResponse.json(
      {
        status: false,
        message: error instanceof Error ? error.message : 'Failed',
      },
      { status: 500 }
    );
  }
}
