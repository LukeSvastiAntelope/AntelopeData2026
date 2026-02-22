import { NextRequest, NextResponse } from 'next/server';
import { openSql } from '@/app/utils/database/db';
import { getUserCampaignScope } from '@/app/utils/campaign-news';

export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
    }

    const db = await openSql();
    const scope = await getUserCampaignScope(userId);
    if (!scope.state) {
      return NextResponse.json({
        status: true,
        unreadCount: 0,
        items: [],
        scopes: { states: [], districts: [] },
      });
    }

    const [userRows]: any = await db.execute(
      'SELECT last_news_seen_at FROM users WHERE id = ? LIMIT 1',
      [userId]
    );
    const cutoff = userRows?.[0]?.last_news_seen_at
      ? new Date(userRows[0].last_news_seen_at)
      : new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

    const params: any[] = [scope.state, cutoff];
    let districtSql = '';
    if (scope.districtCode) {
      districtSql = ' OR district_code = ?';
      params.push(scope.districtCode);
    }

    const [unreadRows]: any = await db.execute(
      `SELECT title, source, url, summary, published_at, state, district_code, relevance_score
       FROM campaign_news_items
       WHERE (state = ?${districtSql})
         AND COALESCE(published_at, ingested_at) > ?
       ORDER BY relevance_score DESC, COALESCE(published_at, ingested_at) DESC
       LIMIT 6`,
      params
    );

    const [countRows]: any = await db.execute(
      `SELECT COUNT(*) AS count
       FROM campaign_news_items
       WHERE (state = ?${districtSql})
         AND COALESCE(published_at, ingested_at) > ?`,
      params
    );

    const states = Array.from(new Set(unreadRows.map((r: any) => r.state).filter(Boolean)));
    const districts = Array.from(new Set(unreadRows.map((r: any) => r.district_code).filter(Boolean)));

    return NextResponse.json({
      status: true,
      unreadCount: countRows?.[0]?.count || 0,
      cutoff: cutoff.toISOString(),
      items: unreadRows.map((r: any) => ({
        title: r.title,
        source: r.source || 'Unknown source',
        url: r.url,
        summary: r.summary || null,
        publishedAt: r.published_at ? new Date(r.published_at).toISOString() : null,
        relevanceScore: parseFloat(r.relevance_score) || 0,
      })),
      scopes: {
        states,
        districts,
      },
    });
  } catch (error) {
    console.error('Failed to get campaign news summary:', error);
    return NextResponse.json(
      { status: false, message: 'Failed to get campaign news summary' },
      { status: 500 }
    );
  }
}
