import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '../../../../utils/database/db';

/**
 * POST /api/organizations/[id]/members
 * Invite a new member to the organization
 * 
 * Body: { email: string, role: 'admin' | 'analyst' | 'viewer' }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orgId } = await params;
    const userId = request.headers.get('x-user-id');

    if (!userId) {
      return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
    }

    const db = await getConnection();

    // Check if user has admin/owner role
    const [membership]: any = await db.execute(
      `SELECT role FROM organization_members WHERE organization_id = ? AND user_id = ? AND status = 'active'`,
      [orgId, userId]
    );

    if (!membership || membership.length === 0 || !['owner', 'admin'].includes(membership[0].role)) {
      return NextResponse.json(
        { status: false, message: 'Only owners and admins can invite members' },
        { status: 403 }
      );
    }

    const { email, role } = await request.json();

    if (!email?.trim()) {
      return NextResponse.json({ status: false, message: 'Email is required' }, { status: 400 });
    }

    if (!['admin', 'analyst', 'viewer'].includes(role)) {
      return NextResponse.json({ status: false, message: 'Invalid role' }, { status: 400 });
    }

    // Find the user by email
    const [users]: any = await db.execute(
      'SELECT id FROM users WHERE email = ?',
      [email.trim()]
    );

    if (!users || users.length === 0) {
      return NextResponse.json(
        { status: false, message: 'User not found. They need to create an account first.' },
        { status: 404 }
      );
    }

    const inviteeId = users[0].id;

    // Check if already a member
    const [existing]: any = await db.execute(
      `SELECT id, status FROM organization_members WHERE organization_id = ? AND user_id = ?`,
      [orgId, inviteeId]
    );

    if (existing && existing.length > 0) {
      if (existing[0].status === 'active') {
        return NextResponse.json({ status: false, message: 'User is already a member' }, { status: 409 });
      }
      // Re-invite removed member
      await db.execute(
        `UPDATE organization_members SET role = ?, status = 'pending', invited_by = ?, invited_at = NOW()
         WHERE organization_id = ? AND user_id = ?`,
        [role, userId, orgId, inviteeId]
      );
    } else {
      await db.execute(
        `INSERT INTO organization_members (organization_id, user_id, role, invited_by, status)
         VALUES (?, ?, ?, ?, 'active')`,
        [orgId, inviteeId, role, userId]
      );
    }

    // Log activity
    await db.execute(
      `INSERT INTO organization_activity_log (organization_id, user_id, action, resource_type, resource_id, details)
       VALUES (?, ?, 'member_invited', 'user', ?, ?)`,
      [orgId, userId, inviteeId, JSON.stringify({ email: email.trim(), role })]
    );

    return NextResponse.json({
      status: true,
      message: `${email} has been added as ${role}`,
    });
  } catch (error) {
    console.error('Invite member error:', error);
    return NextResponse.json({ status: false, message: 'Failed to invite member' }, { status: 500 });
  }
}
