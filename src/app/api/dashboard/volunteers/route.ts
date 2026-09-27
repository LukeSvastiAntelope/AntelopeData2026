import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/app/utils/auth/require-user';
import { ensurePrimaryOrgId } from '@/app/api/dashboard/persons/org';
import {
  VolunteerRepo,
  isStaffRole,
} from '@/app/utils/database/volunteer-repo';
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
  if (!rows.length || !isStaffRole(String(rows[0].role))) {
    return false;
  }
  return true;
}

/** GET /api/dashboard/volunteers — staff roster */
export async function GET(request: NextRequest) {
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
    const status = request.nextUrl.searchParams.get('status') || undefined;
    const volunteers = await VolunteerRepo.listVolunteers(orgId, {
      status: status || undefined,
      limit: 300,
    });
    const org = await VolunteerRepo.getIntakeSchema(orgId);
    const sql = await openSql();
    const [orgRows] = await sql.execute<RowDataPacket[]>(
      `SELECT name, slug, volunteer_signup_enabled FROM organizations WHERE id = ? LIMIT 1`,
      [orgId]
    );
    return NextResponse.json({
      status: true,
      organizationId: orgId,
      organizationName: orgRows[0]?.name || null,
      organizationSlug: orgRows[0]?.slug || null,
      signupEnabled: Number(orgRows[0]?.volunteer_signup_enabled) !== 0,
      publicJoinPath: orgRows[0]?.slug
        ? `/join/${orgRows[0].slug}`
        : null,
      intakeSchema: org,
      volunteers,
      counts: {
        total: volunteers.length,
        active: volunteers.filter((v) => v.status === 'active').length,
        publicSignup: volunteers.filter((v) => v.source === 'public_signup')
          .length,
        staffInvite: volunteers.filter((v) => v.source === 'staff_invite')
          .length,
      },
    });
  } catch (error) {
    console.error('[dashboard volunteers GET]', error);
    return NextResponse.json(
      {
        status: false,
        message: error instanceof Error ? error.message : 'Failed',
      },
      { status: 500 }
    );
  }
}
