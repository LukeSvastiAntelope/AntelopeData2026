import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/app/utils/auth/require-user';
import { ensurePrimaryOrgId } from '@/app/api/dashboard/persons/org';
import { isStaffRole } from '@/app/utils/database/volunteer-repo';
import {
  getVolunteerProfile,
  volunteerEngagementHistory,
} from '@/app/utils/services/volunteer-engagement';
import { openSql } from '@/app/utils/database/db';
import type { RowDataPacket } from 'mysql2/promise';

export const runtime = 'nodejs';

/** GET /api/dashboard/volunteers/[userId] — staff profile + 360 history */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> }
) {
  try {
    const auth = requireUserId(request);
    if (typeof auth !== 'string') return auth;
    const staffId = Number(auth);
    const orgId = await ensurePrimaryOrgId(auth);
    const sql = await openSql();
    const [mem] = await sql.execute<RowDataPacket[]>(
      `SELECT role FROM organization_members
       WHERE organization_id = ? AND user_id = ? AND status = 'active' LIMIT 1`,
      [orgId, staffId]
    );
    if (!mem.length || !isStaffRole(String(mem[0].role))) {
      return NextResponse.json(
        { status: false, message: 'Staff only' },
        { status: 403 }
      );
    }

    const { userId: raw } = await context.params;
    const volunteerUserId = Number(raw);
    if (!Number.isFinite(volunteerUserId)) {
      return NextResponse.json(
        { status: false, message: 'Invalid user id' },
        { status: 400 }
      );
    }

    const profile = await getVolunteerProfile({
      organizationId: orgId,
      userId: volunteerUserId,
    });
    if (!profile) {
      return NextResponse.json(
        { status: false, message: 'Volunteer not found' },
        { status: 404 }
      );
    }

    let history: Awaited<ReturnType<typeof volunteerEngagementHistory>> = [];
    if (profile.personRecordId) {
      history = await volunteerEngagementHistory(
        profile.personRecordId,
        orgId
      );
    }

    return NextResponse.json({
      status: true,
      profile,
      history: history.slice().reverse(), // newest first for UI
    });
  } catch (error) {
    console.error('[dashboard volunteer profile]', error);
    return NextResponse.json(
      {
        status: false,
        message: error instanceof Error ? error.message : 'Failed',
      },
      { status: 500 }
    );
  }
}
