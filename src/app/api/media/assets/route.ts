import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { listUserMediaAssets } from '@/app/utils/services/video/asset-library';

async function resolveUserId(req: NextRequest): Promise<number | null> {
  const session = await auth();
  if (session?.user?.id && Number.isFinite(Number(session.user.id))) {
    return Number(session.user.id);
  }
  const header = req.headers.get('x-user-id');
  if (header && Number.isFinite(Number(header))) return Number(header);
  return null;
}

/** Shared asset pool for Spread generate + clip modes. */
export async function GET(req: NextRequest) {
  try {
    const userId = await resolveUserId(req);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const typeParam = req.nextUrl.searchParams.get('type') || 'all';
    const type =
      typeParam === 'image' || typeParam === 'video' ? typeParam : 'all';
    const assets = await listUserMediaAssets(userId, { type, limit: 80 });
    return NextResponse.json({ ok: true, assets });
  } catch (error) {
    console.error('[media/assets]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list assets' },
      { status: 500 }
    );
  }
}
