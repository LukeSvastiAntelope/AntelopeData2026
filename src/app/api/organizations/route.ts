import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '../../utils/database/db';

/**
 * GET /api/organizations
 * List organizations the current user belongs to
 */
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
    }

    const db = await getConnection();

    const [orgs]: any = await db.execute(
      `SELECT o.*, om.role, 
              (SELECT COUNT(*) FROM organization_members WHERE organization_id = o.id AND status = 'active') as member_count,
              (SELECT COUNT(*) FROM surveys WHERE organization_id = o.id) as survey_count
       FROM organizations o
       JOIN organization_members om ON o.id = om.organization_id
       WHERE om.user_id = ? AND om.status = 'active'
       ORDER BY o.name`,
      [userId]
    );

    return NextResponse.json({ status: true, organizations: orgs });
  } catch (error) {
    console.error('List orgs error:', error);
    return NextResponse.json({ status: false, message: 'Failed to list organizations' }, { status: 500 });
  }
}

/**
 * POST /api/organizations
 * Create a new organization
 */
export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
    }

    const { name, description } = await request.json();

    if (!name?.trim()) {
      return NextResponse.json({ status: false, message: 'Organization name is required' }, { status: 400 });
    }

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const db = await getConnection();

    // Create the organization
    const [result]: any = await db.execute(
      'INSERT INTO organizations (name, slug, description, created_by) VALUES (?, ?, ?, ?)',
      [name.trim(), `${slug}-${Date.now().toString(36)}`, description || null, userId]
    );

    const orgId = result.insertId;

    // Add the creator as owner
    await db.execute(
      `INSERT INTO organization_members (organization_id, user_id, role, status, accepted_at) 
       VALUES (?, ?, 'owner', 'active', NOW())`,
      [orgId, userId]
    );

    // Log the activity
    await db.execute(
      `INSERT INTO organization_activity_log (organization_id, user_id, action, details) 
       VALUES (?, ?, 'organization_created', ?)`,
      [orgId, userId, JSON.stringify({ name: name.trim() })]
    );

    return NextResponse.json({
      status: true,
      organization: { id: orgId, name: name.trim(), slug },
    });
  } catch (error) {
    console.error('Create org error:', error);
    return NextResponse.json({ status: false, message: 'Failed to create organization' }, { status: 500 });
  }
}
