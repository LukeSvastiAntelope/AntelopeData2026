import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import {
  getVolunteerProfile,
  volunteerEngagementHistory,
} from '@/app/utils/services/volunteer-engagement';
import { isPortalRole } from '@/app/utils/database/volunteer-repo';

export const runtime = 'nodejs';

/** GET /api/portal/profile — volunteer self profile + 360 history */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { status: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }
    const userId = Number((session.user as any).id);
    const organizationId = Number((session.user as any).organizationId);
    const orgRole = (session.user as any).orgRole as string | null;
    if (!isPortalRole(orgRole) || !organizationId) {
      return NextResponse.json(
        { status: false, message: 'Volunteer portal only' },
        { status: 403 }
      );
    }

    const profile = await getVolunteerProfile({ organizationId, userId });
    if (!profile) {
      return NextResponse.json(
        { status: false, message: 'Profile not found' },
        { status: 404 }
      );
    }

    let history: Awaited<ReturnType<typeof volunteerEngagementHistory>> = [];
    if (profile.personRecordId) {
      history = await volunteerEngagementHistory(
        profile.personRecordId,
        organizationId
      );
    }

    return NextResponse.json({
      status: true,
      profile,
      history: history.slice().reverse(),
    });
  } catch (error) {
    console.error('[portal profile]', error);
    return NextResponse.json(
      {
        status: false,
        message: error instanceof Error ? error.message : 'Failed',
      },
      { status: 500 }
    );
  }
}
