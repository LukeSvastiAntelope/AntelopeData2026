import { NextRequest, NextResponse } from 'next/server';
import { UserRepo } from '@/app/utils/database/user-repo';
import { getConnection } from '@/app/utils/database/db';

/**
 * GET /api/me
 *
 * Returns the current user, their agent profile, and primary organization
 * using the x-user-id header injected by the auth middleware.
 */
export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json(
        { status: false, message: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Fetch user
    const user = await UserRepo.getUserById(userId);
    if (!user) {
      return NextResponse.json(
        { status: false, message: 'User not found' },
        { status: 404 }
      );
    }

    // Fetch agent profile (may not exist yet)
    let agent = await UserRepo.getAgentByUserId(userId);

    // Auto-create agent if it doesn't exist
    if (!agent) {
      agent = await UserRepo.createAgent(userId);
    }

    // Fetch primary organization (campaign context)
    let organization = null;
    try {
      const db = await getConnection();
      const [orgRows]: any = await db.execute(
        `SELECT o.id, o.name, o.office_type, o.state, o.district_code,
                o.candidate_name, o.party, o.election_year
         FROM organizations o
         JOIN organization_members om ON o.id = om.organization_id
         WHERE om.user_id = ? AND om.status = 'active'
         ORDER BY om.role = 'owner' DESC, o.created_at ASC
         LIMIT 1`,
        [userId]
      );
      if (orgRows.length > 0) {
        const row = orgRows[0];
        organization = {
          id: row.id,
          name: row.name,
          officeType: row.office_type || null,
          state: row.state || null,
          districtCode: row.district_code || null,
          candidateName: row.candidate_name || null,
          party: row.party || null,
          electionYear: row.election_year || null,
        };
      }
    } catch {
      // Org tables may not exist yet
    }

    return NextResponse.json({
      status: true,
      user: {
        id: user.id,
        email: user.email,
        display_name: user.display_name,
        role: user.role,
        username: user.username,
        is_first_login: user.is_first_login,
      },
      agent,
      organization,
    });
  } catch (error) {
    console.error('Error in /api/me:', error);
    return NextResponse.json(
      {
        status: false,
        message: 'Failed to fetch profile',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
