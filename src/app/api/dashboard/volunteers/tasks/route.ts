import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/app/utils/auth/require-user';
import { ensurePrimaryOrgId } from '@/app/api/dashboard/persons/org';
import { isStaffRole } from '@/app/utils/database/volunteer-repo';
import { VolunteerShiftsRepo } from '@/app/utils/database/volunteer-shifts-repo';
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

/** GET /api/dashboard/volunteers/tasks */
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
    const tasks = await VolunteerShiftsRepo.listTasks(orgId, { limit: 200 });
    return NextResponse.json({ status: true, tasks });
  } catch (error) {
    console.error('[dashboard volunteer tasks GET]', error);
    return NextResponse.json(
      {
        status: false,
        message: error instanceof Error ? error.message : 'Failed',
      },
      { status: 500 }
    );
  }
}

/** POST /api/dashboard/volunteers/tasks */
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
    const task = await VolunteerShiftsRepo.createTask({
      organizationId: orgId,
      createdBy: userId,
      title: String(body.title || ''),
      description: body.description ?? null,
      dueAt: body.dueAt ?? null,
      shiftId: body.shiftId ?? null,
    });
    return NextResponse.json({ status: true, task });
  } catch (error) {
    console.error('[dashboard volunteer tasks POST]', error);
    return NextResponse.json(
      {
        status: false,
        message: error instanceof Error ? error.message : 'Failed',
      },
      { status: 500 }
    );
  }
}
