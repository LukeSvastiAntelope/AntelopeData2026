import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/app/utils/auth/require-user';
import { ensurePrimaryOrgId } from '@/app/api/dashboard/persons/org';
import { isStaffRole } from '@/app/utils/database/volunteer-repo';
import { VolunteerShiftsRepo } from '@/app/utils/database/volunteer-shifts-repo';
import { stageShiftReminder } from '@/app/utils/services/volunteer-reminder-service';
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

/** GET /api/dashboard/volunteers/shifts */
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
    const shifts = await VolunteerShiftsRepo.listShifts(orgId, {
      includeCancelled: true,
      limit: 200,
    });
    return NextResponse.json({ status: true, shifts });
  } catch (error) {
    console.error('[dashboard volunteer shifts GET]', error);
    return NextResponse.json(
      {
        status: false,
        message: error instanceof Error ? error.message : 'Failed',
      },
      { status: 500 }
    );
  }
}

/** POST /api/dashboard/volunteers/shifts — create or stage reminders */
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

    if (body.action === 'stage_reminder') {
      const shift = await VolunteerShiftsRepo.getShift(
        Number(body.shiftId),
        orgId
      );
      if (!shift) {
        return NextResponse.json(
          { status: false, message: 'Shift not found' },
          { status: 404 }
        );
      }
      const kind =
        body.kind === 'post_shift_checkin' ? 'post_shift_checkin' : 'pre_shift';
      const out = await stageShiftReminder({
        userId,
        organizationId: orgId,
        shift,
        kind,
        format: body.format === 'sms' ? 'sms' : 'email',
      });
      return NextResponse.json({
        status: true,
        ...out,
        message: out.staged
          ? `Staged ${kind.replace(/_/g, ' ')} for approval on Outbound`
          : out.skippedReason || 'Nothing staged',
      });
    }

    const shift = await VolunteerShiftsRepo.createShift({
      organizationId: orgId,
      createdBy: userId,
      title: String(body.title || ''),
      description: body.description ?? null,
      startsAt: body.startsAt,
      endsAt: body.endsAt ?? null,
      locationText: body.locationText ?? null,
      turfId: body.turfId ?? null,
      capacity: body.capacity ?? null,
      reminderHoursBefore: body.reminderHoursBefore ?? 24,
    });
    return NextResponse.json({ status: true, shift });
  } catch (error) {
    console.error('[dashboard volunteer shifts POST]', error);
    return NextResponse.json(
      {
        status: false,
        message: error instanceof Error ? error.message : 'Failed',
      },
      { status: 500 }
    );
  }
}
