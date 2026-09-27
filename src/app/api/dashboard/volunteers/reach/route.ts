import { NextResponse } from 'next/server';
import { requireUserId } from '@/app/utils/auth/require-user';
import { ensurePrimaryOrgId } from '@/app/api/dashboard/persons/org';
import { isStaffRole } from '@/app/utils/database/volunteer-repo';
import { VolunteerRelationalRepo } from '@/app/utils/database/volunteer-relational-repo';
import { openSql } from '@/app/utils/database/db';
import type { RowDataPacket } from 'mysql2/promise';

export const runtime = 'nodejs';

/**
 * GET /api/dashboard/volunteers/reach
 * Aggregate relational reach only — never exposes private contact PII.
 */
export async function GET(request: Request) {
  try {
    const auth = requireUserId(request as any);
    if (typeof auth !== 'string') return auth;
    const orgId = await ensurePrimaryOrgId(auth);
    const sql = await openSql();
    const [rows] = await sql.execute<RowDataPacket[]>(
      `SELECT role FROM organization_members
       WHERE organization_id = ? AND user_id = ? AND status = 'active' LIMIT 1`,
      [orgId, Number(auth)]
    );
    if (!rows.length || !isStaffRole(String(rows[0].role))) {
      return NextResponse.json(
        { status: false, message: 'Staff only' },
        { status: 403 }
      );
    }

    const reach = await VolunteerRelationalRepo.orgReachStats(orgId);
    return NextResponse.json({
      status: true,
      reach,
      note: 'Private contact details are never shown to staff — reach counts only.',
    });
  } catch (error) {
    console.error('[dashboard volunteers reach]', error);
    return NextResponse.json(
      {
        status: false,
        message: error instanceof Error ? error.message : 'Failed',
      },
      { status: 500 }
    );
  }
}
