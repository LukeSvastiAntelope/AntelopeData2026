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
        `INSERT INTO organization_members (organization_id, user_id, role, invited_by, status, accepted_at)
         VALUES (?, ?, ?, ?, 'active', NOW())`,
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

/**
 * PATCH /api/organizations/[id]/members
 * Update a member's role or remove them
 * 
 * Body: { userId: number, role?: string, action?: 'remove' }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orgId } = await params;
    const currentUserId = request.headers.get('x-user-id');

    if (!currentUserId) {
      return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
    }

    const db = await getConnection();

    // Check if current user is owner or admin
    const [membership]: any = await db.execute(
      `SELECT role FROM organization_members WHERE organization_id = ? AND user_id = ? AND status = 'active'`,
      [orgId, currentUserId]
    );

    if (!membership || membership.length === 0 || !['owner', 'admin'].includes(membership[0].role)) {
      return NextResponse.json(
        { status: false, message: 'Only owners and admins can manage members' },
        { status: 403 }
      );
    }

    const { userId: targetUserId, role, action } = await request.json();

    if (!targetUserId) {
      return NextResponse.json({ status: false, message: 'userId is required' }, { status: 400 });
    }

    // Prevent removing the owner
    const [target]: any = await db.execute(
      `SELECT role FROM organization_members WHERE organization_id = ? AND user_id = ?`,
      [orgId, targetUserId]
    );

    if (!target || target.length === 0) {
      return NextResponse.json({ status: false, message: 'Member not found' }, { status: 404 });
    }

    if (target[0].role === 'owner') {
      return NextResponse.json({ status: false, message: 'Cannot modify the organization owner' }, { status: 403 });
    }

    if (action === 'remove') {
      await db.execute(
        `UPDATE organization_members SET status = 'removed' WHERE organization_id = ? AND user_id = ?`,
        [orgId, targetUserId]
      );

      await db.execute(
        `INSERT INTO organization_activity_log (organization_id, user_id, action, resource_type, resource_id, details)
         VALUES (?, ?, 'member_removed', 'user', ?, ?)`,
        [orgId, currentUserId, targetUserId, JSON.stringify({ previous_role: target[0].role })]
      );

      return NextResponse.json({ status: true, message: 'Member removed' });
    }

    if (role && ['admin', 'analyst', 'viewer'].includes(role)) {
      await db.execute(
        `UPDATE organization_members SET role = ? WHERE organization_id = ? AND user_id = ?`,
        [role, orgId, targetUserId]
      );

      await db.execute(
        `INSERT INTO organization_activity_log (organization_id, user_id, action, resource_type, resource_id, details)
         VALUES (?, ?, 'member_role_changed', 'user', ?, ?)`,
        [orgId, currentUserId, targetUserId, JSON.stringify({ from: target[0].role, to: role })]
      );

      return NextResponse.json({ status: true, message: `Role updated to ${role}` });
    }

    return NextResponse.json({ status: false, message: 'No valid action provided' }, { status: 400 });
  } catch (error) {
    console.error('Update member error:', error);
    return NextResponse.json({ status: false, message: 'Failed to update member' }, { status: 500 });
  }
}
