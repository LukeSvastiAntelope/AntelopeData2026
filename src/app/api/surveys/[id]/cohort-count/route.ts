import { NextRequest, NextResponse } from 'next/server';
import { openSql as getMySQLConnection } from '@/app/utils/database/db';
import { auth } from '@/auth';

/**
 * POST /api/surveys/[id]/cohort-count
 *
 * Lightweight endpoint that returns the number of respondents matching a set
 * of cohort filter rules for a given survey.  Used by the DynamicCohortBuilder
 * for live respondent counting with debounced requests.
 *
 * Body: { filters: Array<{ field, op, value }> }
 * Response: { status: true, count: number, total: number }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const surveyId = parseInt(id);
    if (isNaN(surveyId)) {
      return NextResponse.json({ status: false, message: 'Invalid survey ID' }, { status: 400 });
    }

    const body = await request.json();
    const filters: Array<{ field: string; op: string; value: string | string[] }> = body.filters ?? [];

    const db = await getMySQLConnection();

    // Total respondents for this survey (unfiltered)
    const [totalRows] = await db.execute(
      'SELECT COUNT(DISTINCT id) AS total FROM survey_responses WHERE survey_id = ?',
      [surveyId]
    ) as any[];
    const total: number = totalRows[0]?.total ?? 0;

    // If no filters, count === total
    if (filters.length === 0) {
      return NextResponse.json({ status: true, count: total, total });
    }

    // Build WHERE clause from filter rules
    const whereParts: string[] = [];
    const queryParams: any[] = [surveyId];

    for (const rule of filters) {
      if (!rule.field || rule.value === '' || (Array.isArray(rule.value) && rule.value.length === 0)) continue;

      // Demographic / voter-file fields stored in survey_responses.demographics JSON
      if (!rule.field.startsWith('question_')) {
        switch (rule.op) {
          case '=':
            whereParts.push(`JSON_UNQUOTE(JSON_EXTRACT(sr.demographics, CONCAT('$.', ?))) = ?`);
            queryParams.push(rule.field, rule.value);
            break;
          case 'IN': {
            const vals = Array.isArray(rule.value) ? rule.value : String(rule.value).split(',');
            if (vals.length > 0) {
              const placeholders = vals.map(() => '?').join(',');
              whereParts.push(`JSON_UNQUOTE(JSON_EXTRACT(sr.demographics, CONCAT('$.', ?))) IN (${placeholders})`);
              queryParams.push(rule.field, ...vals);
            }
            break;
          }
          case 'CONTAINS':
            whereParts.push(`JSON_UNQUOTE(JSON_EXTRACT(sr.demographics, CONCAT('$.', ?))) LIKE ?`);
            queryParams.push(rule.field, `%${rule.value}%`);
            break;
        }
        continue;
      }

      // Question-based filter — join through survey_answers
      const questionId = parseInt(rule.field.replace('question_', ''));
      if (isNaN(questionId)) continue;

      switch (rule.op) {
        case '=':
          whereParts.push(
            `sr.id IN (SELECT response_id FROM survey_answers WHERE question_id = ? AND answer_value = ?)`
          );
          queryParams.push(questionId, rule.value);
          break;
        case 'IN': {
          const vals = Array.isArray(rule.value) ? rule.value : String(rule.value).split(',');
          if (vals.length > 0) {
            const placeholders = vals.map(() => '?').join(',');
            whereParts.push(
              `sr.id IN (SELECT response_id FROM survey_answers WHERE question_id = ? AND answer_value IN (${placeholders}))`
            );
            queryParams.push(questionId, ...vals);
          }
          break;
        }
        case 'CONTAINS':
          whereParts.push(
            `sr.id IN (SELECT response_id FROM survey_answers WHERE question_id = ? AND answer_value LIKE ?)`
          );
          queryParams.push(questionId, `%${rule.value}%`);
          break;
      }
    }

    if (whereParts.length === 0) {
      return NextResponse.json({ status: true, count: total, total });
    }

    const sql = `SELECT COUNT(DISTINCT sr.id) AS cnt FROM survey_responses sr WHERE sr.survey_id = ? AND ${whereParts.join(' AND ')}`;
    const [rows] = await db.execute(sql, queryParams) as any[];
    const count: number = rows[0]?.cnt ?? 0;

    return NextResponse.json({ status: true, count, total });
  } catch (error) {
    console.error('Error in cohort-count:', error);
    return NextResponse.json(
      { status: false, message: 'Failed to count respondents' },
      { status: 500 }
    );
  }
}
