import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/app/utils/auth/require-user';
import { ensurePrimaryOrgId } from '@/app/api/dashboard/persons/org';
import { VolunteerRepo, isStaffRole } from '@/app/utils/database/volunteer-repo';
import { EmailService } from '@/app/utils/services/email-service';
import { openSql } from '@/app/utils/database/db';
import type { RowDataPacket } from 'mysql2/promise';

export const runtime = 'nodejs';

/**
 * POST /api/dashboard/volunteers/invite
 * Staff issues a passwordless magic-link invite for a volunteer.
 * body: { email, displayName? }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = requireUserId(request);
    if (typeof auth !== 'string') return auth;
    const userId = Number(auth);
    const orgId = await ensurePrimaryOrgId(auth);

    const sql = await openSql();
    const [membership] = await sql.execute<RowDataPacket[]>(
      `SELECT role FROM organization_members
       WHERE organization_id = ? AND user_id = ? AND status = 'active'
       LIMIT 1`,
      [orgId, userId]
    );
    if (!membership.length || !isStaffRole(String(membership[0].role))) {
      return NextResponse.json(
        { status: false, message: 'Only campaign staff can invite volunteers' },
        { status: 403 }
      );
    }
    // Owners/admins invite; analysts/viewers can view later phases — lock invite to owner/admin
    if (!['owner', 'admin'].includes(String(membership[0].role))) {
      return NextResponse.json(
        { status: false, message: 'Only owners and admins can invite volunteers' },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const email = String(body.email || '').trim().toLowerCase();
    const displayName = body.displayName
      ? String(body.displayName).trim()
      : null;
    if (!email || !email.includes('@')) {
      return NextResponse.json(
        { status: false, message: 'Valid email is required' },
        { status: 400 }
      );
    }

    const issued = await VolunteerRepo.issueMagicLink({
      organizationId: orgId,
      email,
      displayName,
      invitedBy: userId,
    });

    const [orgRows] = await sql.execute<RowDataPacket[]>(
      `SELECT name FROM organizations WHERE id = ? LIMIT 1`,
      [orgId]
    );
    const campaignName = orgRows[0]?.name
      ? String(orgRows[0].name)
      : null;

    await EmailService.sendVolunteerMagicLink(
      issued.email,
      displayName || undefined,
      issued.rawToken,
      campaignName
    );

    const joinPath = `/portal/auth/verify?token=${encodeURIComponent(issued.rawToken)}`;

    return NextResponse.json({
      status: true,
      email: issued.email,
      expiresAt: issued.expiresAt.toISOString(),
      joinPath,
      // Raw token returned only to staff so they can share QR/link when email is unavailable
      token: issued.rawToken,
    });
  } catch (error) {
    console.error('[dashboard volunteers invite]', error);
    return NextResponse.json(
      {
        status: false,
        message: error instanceof Error ? error.message : 'Invite failed',
      },
      { status: 500 }
    );
  }
}
