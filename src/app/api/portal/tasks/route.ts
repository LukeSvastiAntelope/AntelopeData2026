import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isPortalRole } from '@/app/utils/database/volunteer-repo';
import { VolunteerShiftsRepo } from '@/app/utils/database/volunteer-shifts-repo';

export const runtime = 'nodejs';

function portalIdentity(session: any) {
  const userId = Number(session?.user?.id);
  const organizationId = Number(session?.user?.organizationId);
  const personRecordId =
    session?.user?.personRecordId != null
      ? Number(session.user.personRecordId)
      : null;
  const orgRole = session?.user?.orgRole as string | null;
  if (!isPortalRole(orgRole) || !organizationId || !userId) return null;
  return { userId, organizationId, personRecordId };
}

/** GET /api/portal/tasks */
export async function GET() {
  try {
    const session = await auth();
    const id = portalIdentity(session);
    if (!id) {
      return NextResponse.json(
        { status: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }
    const tasks = await VolunteerShiftsRepo.listTasks(id.organizationId, {
      openOnly: true,
      forUserId: id.userId,
      limit: 100,
    });
    return NextResponse.json({ status: true, tasks });
  } catch (error) {
    console.error('[portal tasks GET]', error);
    return NextResponse.json(
      {
        status: false,
        message: error instanceof Error ? error.message : 'Failed',
      },
      { status: 500 }
    );
  }
}

/** POST /api/portal/tasks — claim | complete */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    const id = portalIdentity(session);
    if (!id) {
      return NextResponse.json(
        { status: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }
    const body = await request.json().catch(() => ({}));
    const taskId = Number(body.taskId);
    if (!Number.isFinite(taskId)) {
      return NextResponse.json(
        { status: false, message: 'taskId required' },
        { status: 400 }
      );
    }
    const action = String(body.action || 'claim');
    const task =
      action === 'complete'
        ? await VolunteerShiftsRepo.completeTask({
            taskId,
            organizationId: id.organizationId,
            userId: id.userId,
          })
        : await VolunteerShiftsRepo.claimTask({
            taskId,
            organizationId: id.organizationId,
            userId: id.userId,
            personRecordId: id.personRecordId,
          });
    return NextResponse.json({ status: true, task });
  } catch (error) {
    console.error('[portal tasks POST]', error);
    return NextResponse.json(
      {
        status: false,
        message: error instanceof Error ? error.message : 'Failed',
      },
      { status: 500 }
    );
  }
}
