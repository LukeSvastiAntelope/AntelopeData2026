import { NextRequest, NextResponse } from 'next/server';
import { openSql } from '@/app/utils/database/db';
import { SurveyRepo } from '@/app/utils/database/survey-repo';

export const runtime = 'nodejs';
export const maxDuration = 20;

/**
 * POST /api/garrys-list/answer
 *
 * Anonymous single-tap answer submission for the reader-facing embed/short
 * link (no login, no demographics). Immediately returns the updated
 * percentage split for that question so the tap can "reveal" in place.
 * Public — no auth required.
 *
 * Body: { shortCode: string, questionId: number, value: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const shortCode = String(body?.shortCode || '').trim();
    const questionId = Number(body?.questionId);
    const value = String(body?.value || '').trim();

    if (!shortCode || !questionId || !value) {
      return NextResponse.json({ status: false, message: 'Missing shortCode, questionId, or value' }, { status: 400 });
    }

    const db = await openSql();
    const [surveys]: any = await db.execute(
      `SELECT id, status FROM surveys WHERE slug LIKE CONCAT('%-', ?) AND source = 'garrys_list' LIMIT 1`,
      [shortCode]
    );
    const survey = surveys?.[0];
    if (!survey) {
      return NextResponse.json({ status: false, message: 'Survey not found' }, { status: 404 });
    }

    const [questions]: any = await db.execute(
      'SELECT id, options FROM survey_questions WHERE id = ? AND survey_id = ?',
      [questionId, survey.id]
    );
    if (!questions?.length) {
      return NextResponse.json({ status: false, message: 'Question not found' }, { status: 404 });
    }

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || '';
    const userAgent = request.headers.get('user-agent') || '';

    await SurveyRepo.submitSurveyResponse(
      {
        surveyId: survey.id,
        demographics: {},
        answers: [{ questionId, value }],
        source: 'api',
      },
      ip,
      userAgent
    );

    // Return the live split for this question so the tap can reveal in place.
    const [tally]: any = await db.execute(
      'SELECT answer_value, COUNT(*) as n FROM survey_answers WHERE question_id = ? GROUP BY answer_value',
      [questionId]
    );
    const total = tally.reduce((sum: number, row: any) => sum + Number(row.n), 0);
    const options: string[] = (() => {
      try {
        const raw = questions[0].options;
        return typeof raw === 'string' ? JSON.parse(raw) : raw || [];
      } catch {
        return [];
      }
    })();
    const split = options.map((label) => {
      const row = tally.find((r: any) => r.answer_value === label);
      const n = row ? Number(row.n) : 0;
      return { label, count: n, pct: total > 0 ? Math.round((n / total) * 100) : 0 };
    });

    return NextResponse.json({ status: true, total, split });
  } catch (error) {
    console.error('garrys-list answer error:', error);
    return NextResponse.json(
      { status: false, message: error instanceof Error ? error.message : 'Failed to record answer' },
      { status: 500 }
    );
  }
}
