import { NextRequest, NextResponse } from 'next/server';
import {
  EmailEventRepo,
  EmailSendRepo,
  EmailSuppressionRepo,
} from '@/app/utils/database/email-send-repo';

export const runtime = 'nodejs';

/**
 * GET /api/outbound/email/results
 * Recent sends with per-recipient delivery status + event stream + suppressions.
 */
export async function GET(request: NextRequest) {
  try {
    const userIdHeader = request.headers.get('x-user-id');
    if (!userIdHeader) {
      return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
    }
    const userId = Number(userIdHeader);
    if (!Number.isFinite(userId) || userId <= 0) {
      return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
    }

    const limit = Math.min(
      50,
      Math.max(1, Number(request.nextUrl.searchParams.get('limit') || 15) || 15)
    );

    const [sends, events, suppressions] = await Promise.all([
      EmailSendRepo.listRecentSends(userId, limit),
      EmailEventRepo.listForUser(userId, 40),
      EmailSuppressionRepo.listForUser(userId, 100),
    ]);

    return NextResponse.json({
      status: true,
      sends,
      events,
      suppressions,
    });
  } catch (error) {
    console.error('[outbound/email/results]', error);
    return NextResponse.json(
      { status: false, message: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}
