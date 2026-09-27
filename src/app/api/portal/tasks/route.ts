import { NextRequest, NextResponse } from 'next/server';
import { requirePortalIdentity } from '@/app/utils/auth/portal-identity';
import { VolunteerShiftsRepo } from '@/app/utils/database/volunteer-shifts-repo';
import { VolunteerEventsRepo } from '@/app/utils/database/volunteer-events-repo';

export const runtime = 'nodejs';

/** GET /api/portal/tasks */
export async function GET() {
  try {
    const id = await requirePortalIdentity();
    if (id instanceof Response) return id;
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
    const id = await requirePortalIdentity();
    if (id instanceof Response) return id;
    const body = await request.json().catch(() => ({}));
    const taskId = Number(body.taskId);
    if (!Number.isFinite(taskId)) {
      return NextResponse.json(
        { status: false, message: 'taskId required' },
        { status: 400 }
      );
    }
    const action = String(body.action || 'claim');
    let task;
    if (action === 'complete') {
      task = await VolunteerShiftsRepo.completeTask({
        taskId,
        organizationId: id.organizationId,
        userId: id.userId,
      });
      await VolunteerEventsRepo.append({
        organizationId: id.organizationId,
        userId: id.userId,
        kind: 'task_completed',
        relatedType: 'task',
        relatedId: taskId,
      });
    } else {
      task = await VolunteerShiftsRepo.claimTask({
        taskId,
        organizationId: id.organizationId,
        userId: id.userId,
        personRecordId: id.personRecordId,
      });
      await VolunteerEventsRepo.append({
        organizationId: id.organizationId,
        userId: id.userId,
        kind: 'task_claimed',
        points: 0,
        relatedType: 'task',
        relatedId: taskId,
      });
    }
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
