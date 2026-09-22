import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/app/utils/auth/require-user';
import { openSql } from '@/app/utils/database/db';

export async function POST(request: NextRequest) {
  try {
    const auth = requireUserId(request);
    if (typeof auth !== 'string') return auth;
    const userId = Number(auth);

    const db = await openSql();
    await db.execute(
      'UPDATE users SET last_news_seen_at = NOW() WHERE id = ?',
      [userId]
    );

    return NextResponse.json({
      status: true,
      message: 'Campaign news marked as seen',
    });
  } catch (error) {
    console.error('Failed to mark campaign news as seen:', error);
    return NextResponse.json(
      { status: false, message: 'Failed to mark campaign news as seen' },
      { status: 500 }
    );
  }
}
