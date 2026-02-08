import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '../../../utils/database/db';

/**
 * GET /api/organizations/[id]
 * Get organization details
 */
export async function GET(
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

    // Verify membership
    const [membership]: any = await db.execute(
      `SELECT role FROM organization_members WHERE organization_id = ? AND user_id = ? AND status = 'active'`,
      [orgId, userId]
    );

    if (!membership || membership.length === 0) {
      return NextResponse.json({ status: false, message: 'Not a member of this organization' }, { status: 403 });
    }

    // Get org details
    const [orgs]: any = await db.execute('SELECT * FROM organizations WHERE id = ?', [orgId]);
    if (!orgs || orgs.length === 0) {
      return NextResponse.json({ status: false, message: 'Organization not found' }, { status: 404 });
    }

    // Get members
    const [members]: any = await db.execute(
      `SELECT om.*, u.email, u.display_name 
       FROM organization_members om
       JOIN users u ON om.user_id = u.id
       WHERE om.organization_id = ? AND om.status IN ('active', 'pending')
       ORDER BY om.role, u.display_name`,
      [orgId]
    );

    // Get shared surveys
    const [surveys]: any = await db.execute(
      `SELECT id, title, status, created_at, 
              (SELECT COUNT(*) FROM survey_responses WHERE survey_id = surveys.id) as response_count
       FROM surveys WHERE organization_id = ?
       ORDER BY created_at DESC`,
      [orgId]
    );

    // Get recent activity
    const [activity]: any = await db.execute(
      `SELECT al.*, u.display_name, u.email
       FROM organization_activity_log al
       JOIN users u ON al.user_id = u.id
       WHERE al.organization_id = ?
       ORDER BY al.created_at DESC LIMIT 20`,
      [orgId]
    );

    return NextResponse.json({
      status: true,
      organization: orgs[0],
      userRole: membership[0].role,
      members,
      surveys,
      activity,
    });
  } catch (error) {
    console.error('Get org error:', error);
    return NextResponse.json({ status: false, message: 'Failed to get organization' }, { status: 500 });
  }
}
