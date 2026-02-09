import { NextRequest, NextResponse } from 'next/server';
import { UserRepo } from '@/app/utils/database/user-repo';

/**
 * GET /api/me
 *
 * Returns the current user and their agent profile using the
 * x-user-id header injected by the auth middleware.
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
