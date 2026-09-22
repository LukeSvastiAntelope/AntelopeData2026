import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/app/utils/auth/require-user';
import { auth } from '@/auth';
import { refreshVideoJob } from '@/app/utils/services/video/generate-service';
import { loadVideoJob } from '@/app/utils/services/video/job-store';

async function resolveUserId(req: NextRequest): Promise<number | null> {
  const session = await auth();
  if (session?.user?.id && Number.isFinite(Number(session.user.id))) {
    return Number(session.user.id);
  }
  const authResult = requireUserId(req);
  if (typeof authResult === 'string' && Number.isFinite(Number(authResult))) return Number(authResult);
  return null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const userId = await resolveUserId(req);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { jobId } = await params;
    const existing = loadVideoJob(jobId);
    if (!existing || Number(existing.userId) !== Number(userId)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const job = await refreshVideoJob(jobId);
    return NextResponse.json({ ok: true, job });
  } catch (error) {
    console.error('[video/jobs]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Status failed' },
      { status: 500 }
    );
  }
}
