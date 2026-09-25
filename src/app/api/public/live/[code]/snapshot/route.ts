import { NextRequest, NextResponse } from 'next/server';
import { LiveRepo } from '@/app/utils/database/live-repo';

export const runtime = 'nodejs';

/**
 * GET /api/public/live/[code]/snapshot
 * Presenter / SSE initial payload — poll bars, word cloud, Q&A, counts.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ code: string }> }
) {
  try {
    const { code: raw } = await context.params;
    const snapshot = await LiveRepo.buildScreenSnapshot(raw);
    if (!snapshot) {
      return NextResponse.json(
        { status: false, message: 'Session not found' },
        { status: 404 }
      );
    }
    return NextResponse.json({ status: true, snapshot });
  } catch (error) {
    console.error('[public live snapshot]', error);
    return NextResponse.json(
      {
        status: false,
        message: error instanceof Error ? error.message : 'Failed',
      },
      { status: 500 }
    );
  }
}
