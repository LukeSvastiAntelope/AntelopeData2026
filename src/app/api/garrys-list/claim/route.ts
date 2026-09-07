import { NextRequest, NextResponse } from 'next/server';
import { openSql } from '@/app/utils/database/db';

export const runtime = 'nodejs';

/**
 * POST /api/garrys-list/claim
 *
 * Transfers ownership of a Garry's List survey (created under the
 * no-login system user) to the now-authenticated publisher, proven by the
 * access token they were handed on the survey-ready page. This is what
 * makes "Log in to edit" actually work — without it the survey stays
 * owned by the system user and never shows up for the publisher to edit.
 *
 * Auth-gated by middleware (not in publicRoutes) — requires a session.
 * Body: { surveyId: number, token: string }
 */
export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ status: false, message: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const surveyId = parseInt(body?.surveyId, 10);
    const token = String(body?.token || '').trim().toUpperCase();
    if (!surveyId || !token) {
      return NextResponse.json({ status: false, message: 'Missing survey or token' }, { status: 400 });
    }

    const db = await openSql();
    const [rows]: any = await db.execute(
      `SELECT id FROM surveys
       WHERE id = ? AND source = 'garrys_list' AND source_metadata->>'$.accessToken' = ?
       LIMIT 1`,
      [surveyId, token]
    );
    if (!rows?.[0]) {
      return NextResponse.json({ status: false, message: "That token doesn't match this survey." }, { status: 404 });
    }

    await db.execute('UPDATE surveys SET created_by = ? WHERE id = ?', [userId, surveyId]);

    return NextResponse.json({ status: true, surveyId });
  } catch (error) {
    console.error('garrys-list claim error:', error);
    return NextResponse.json(
      { status: false, message: error instanceof Error ? error.message : 'Failed to claim survey' },
      { status: 500 }
    );
  }
}
