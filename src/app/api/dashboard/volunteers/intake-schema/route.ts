import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/app/utils/auth/require-user';
import { ensurePrimaryOrgId } from '@/app/api/dashboard/persons/org';
import {
  VolunteerRepo,
  isStaffRole,
  type VolunteerIntakeSchema,
} from '@/app/utils/database/volunteer-repo';
import { openSql } from '@/app/utils/database/db';
import type { RowDataPacket } from 'mysql2/promise';

export const runtime = 'nodejs';

async function assertOwnerAdmin(orgId: number, userId: number) {
  const sql = await openSql();
  const [rows] = await sql.execute<RowDataPacket[]>(
    `SELECT role FROM organization_members
     WHERE organization_id = ? AND user_id = ? AND status = 'active' LIMIT 1`,
    [orgId, userId]
  );
  const role = rows[0] ? String(rows[0].role) : '';
  return role === 'owner' || role === 'admin';
}

async function assertStaff(orgId: number, userId: number) {
  const sql = await openSql();
  const [rows] = await sql.execute<RowDataPacket[]>(
    `SELECT role FROM organization_members
     WHERE organization_id = ? AND user_id = ? AND status = 'active' LIMIT 1`,
    [orgId, userId]
  );
  return rows.length > 0 && isStaffRole(String(rows[0].role));
}

/** GET /api/dashboard/volunteers/intake-schema */
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
    const schema = await VolunteerRepo.getIntakeSchema(orgId);
    const sql = await openSql();
    const [rows] = await sql.execute<RowDataPacket[]>(
      `SELECT slug, volunteer_signup_enabled FROM organizations WHERE id = ?`,
      [orgId]
    );
    return NextResponse.json({
      status: true,
      intakeSchema: schema,
      signupEnabled: Number(rows[0]?.volunteer_signup_enabled) !== 0,
      publicJoinPath: rows[0]?.slug ? `/join/${rows[0].slug}` : null,
    });
  } catch (error) {
    console.error('[volunteers intake-schema GET]', error);
    return NextResponse.json(
      { status: false, message: 'Failed' },
      { status: 500 }
    );
  }
}

/** PUT /api/dashboard/volunteers/intake-schema — owner/admin */
export async function PUT(request: NextRequest) {
  try {
    const auth = requireUserId(request);
    if (typeof auth !== 'string') return auth;
    const orgId = await ensurePrimaryOrgId(auth);
    if (!(await assertOwnerAdmin(orgId, Number(auth)))) {
      return NextResponse.json(
        { status: false, message: 'Only owners and admins can edit intake' },
        { status: 403 }
      );
    }
    const body = await request.json().catch(() => ({}));
    const schema = (body.intakeSchema || body) as VolunteerIntakeSchema;
    const signupEnabled =
      body.signupEnabled !== undefined ? Boolean(body.signupEnabled) : undefined;
    const saved = await VolunteerRepo.updateIntakeSchema(
      orgId,
      schema,
      signupEnabled
    );
    return NextResponse.json({ status: true, intakeSchema: saved });
  } catch (error) {
    console.error('[volunteers intake-schema PUT]', error);
    return NextResponse.json(
      {
        status: false,
        message: error instanceof Error ? error.message : 'Failed',
      },
      { status: 500 }
    );
  }
}
