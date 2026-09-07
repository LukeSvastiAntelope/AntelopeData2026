import { NextRequest, NextResponse } from 'next/server';
import { openSql } from '@/app/utils/database/db';

export const runtime = 'nodejs';

function parseOptions(raw: any): string[] {
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/**
 * GET /api/garrys-list/survey?code=<shortCode>
 *
 * Resolves a short code (from /s/<code>) to the public survey + its first
 * (single-tap) question. Public — no auth required.
 */
export async function GET(request: NextRequest) {
  try {
    const code = new URL(request.url).searchParams.get('code')?.trim();
    if (!code) {
      return NextResponse.json({ status: false, message: 'Missing code' }, { status: 400 });
    }

    const db = await openSql();
    const [surveys]: any = await db.execute(
      `SELECT id, title, slug, status, source_metadata FROM surveys
       WHERE slug LIKE CONCAT('%-', ?) AND source = 'garrys_list' LIMIT 1`,
      [code]
    );
    const survey = surveys?.[0];
    if (!survey) {
      return NextResponse.json({ status: false, message: 'Survey not found' }, { status: 404 });
    }
    const metadata = typeof survey.source_metadata === 'string' ? JSON.parse(survey.source_metadata) : survey.source_metadata || {};

    const [questions]: any = await db.execute(
      'SELECT id, type, prompt, options, question_order FROM survey_questions WHERE survey_id = ? ORDER BY question_order ASC LIMIT 1',
      [survey.id]
    );
    const first = questions?.[0];

    return NextResponse.json({
      status: true,
      survey: { id: survey.id, title: survey.title, slug: survey.slug, status: survey.status },
      isSingleTap: Number(metadata.numQuestions) === 1,
      firstQuestion: first ? { id: first.id, prompt: first.prompt, options: parseOptions(first.options) } : null,
      methodologyNote: metadata.methodologyNote || '',
      publisherName: metadata.publisherName || '',
    });
  } catch (error) {
    console.error('garrys-list survey lookup error:', error);
    return NextResponse.json({ status: false, message: 'Failed to load survey' }, { status: 500 });
  }
}
