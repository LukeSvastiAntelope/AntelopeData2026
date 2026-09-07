import { NextRequest, NextResponse } from 'next/server';
import { SurveyRepo } from '@/app/utils/database/survey-repo';
import { openSql as getMySQLConnection } from '@/app/utils/database/db';
import type { RowDataPacket } from 'mysql2/promise';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Auth – user ID should be attached by middleware
    const userIdHeader = request.headers.get('x-user-id');
    console.log('🔍 Data API Debug - Auth header:', userIdHeader);
    
    if (!userIdHeader) {
      return NextResponse.json({ error: 'User not authenticated' }, { status: 401 });
    }
    const userId = parseInt(userIdHeader);

    const { id: surveyId } = await params;
    const surveyIdNum = parseInt(surveyId);
    
    console.log('🔍 Data API Debug - Survey lookup:', { surveyIdNum, userId });

    // First, verify the user owns this survey or it's public
    const survey = await SurveyRepo.getSurveyById(surveyIdNum, userId);
    console.log('🔍 Data API Debug - Survey found:', survey ? 'YES' : 'NO');

    if (!survey) {
      return NextResponse.json({ error: 'Survey not found' }, { status: 404 });
    }

    const db = await getMySQLConnection();

    // Get survey questions for schema
    const [questionRows] = await db.execute<RowDataPacket[]>(
      `SELECT id, prompt, type, options, question_order FROM survey_questions 
       WHERE survey_id = ? ORDER BY question_order ASC`,
      [surveyIdNum]
    );
    
    console.log('🔍 Data API Debug - Questions found:', questionRows.length);

    // Get survey responses with answers
    const [responseRows] = await db.execute<RowDataPacket[]>(
      `SELECT 
        sr.id as response_id,
        sr.submitted_at,
        sr.demographics,
        sa.question_id,
        sa.answer_value,
        sq.question_order
      FROM survey_responses sr
      LEFT JOIN survey_answers sa ON sr.id = sa.response_id
      LEFT JOIN survey_questions sq ON sa.question_id = sq.id
      WHERE sr.survey_id = ?
      ORDER BY sr.id, sq.question_order`,
      [surveyIdNum]
    );
    
    console.log('🔍 Data API Debug - Response rows found:', responseRows.length);
    console.log('🔍 Data API Debug - First response row:', responseRows[0]);

    if (responseRows.length === 0) {
      return NextResponse.json({ error: 'No responses found' }, { status: 404 });
    }

    // Transform data into a structured format for Python analysis
    const responses = new Map();
    
    responseRows.forEach((row: any) => {
      if (!responses.has(row.response_id)) {
        responses.set(row.response_id, {
          response_id: row.response_id,
          submitted_at: row.submitted_at,
          demographics: row.demographics,
          answers: {}
        });
      }
      
      if (row.question_id && row.question_order !== null) {
        responses.get(row.response_id).answers[`Q${row.question_order}`] = row.answer_value;
      }
    });

    // Make a pandas/CSV-safe column suffix from an option label.
    const safe = (s: any) => String(s).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'opt';

    // Per-question metadata (parse options once; detect multi-select).
    const qMeta = questionRows.map((q: any) => {
      let opts: string[] | null = null;
      try { opts = q.options ? (typeof q.options === 'string' ? JSON.parse(q.options) : q.options) : null; } catch { opts = null; }
      const isMulti = String(q.type || '').toLowerCase().includes('multiple');
      return { col: `Q${q.question_order}`, type: q.type, prompt: q.prompt, options: opts, isMulti };
    });

    // Parse a possibly JSON-array-encoded answer into a clean string[] of labels.
    const parseMulti = (val: any): string[] => {
      if (val === null || val === undefined) return [];
      if (Array.isArray(val)) return val.map((x) => String(x));
      const s = String(val).trim();
      if (s.startsWith('[')) {
        try { const a = JSON.parse(s); return Array.isArray(a) ? a.map((x) => String(x)) : (s ? [s] : []); } catch { return s ? [s] : []; }
      }
      return s ? [s] : [];
    };

    // Convert to array. Multiple-choice ("select all") answers are stored as
    // JSON-array strings; we parse them into a readable comma-joined value AND
    // emit a binary 0/1 indicator column per option (e.g. Q1_Vanilla) so the
    // analysis agent can compute correct cross-tabs / chi-square / regression
    // instead of treating the whole array string as one category.
    const data = Array.from(responses.values()).map(response => {
      const row: any = {
        response_id: response.response_id,
        submitted_at: response.submitted_at
      };

      if (response.demographics) {
        try {
          const demo = typeof response.demographics === 'string'
            ? JSON.parse(response.demographics)
            : response.demographics;
          Object.keys(demo).forEach(key => { row[`demo_${key}`] = demo[key]; });
        } catch (e) {
          console.warn('Could not parse demographics:', e);
        }
      }

      qMeta.forEach((q: any) => {
        const raw = response.answers[q.col];
        if (q.isMulti) {
          const selected = parseMulti(raw);
          row[q.col] = selected.length ? selected.join(', ') : null;
          const optionList: string[] = Array.isArray(q.options) && q.options.length ? q.options : [...new Set(selected)];
          optionList.forEach((opt) => { row[`${q.col}_${safe(opt)}`] = selected.includes(opt) ? 1 : 0; });
        } else {
          row[q.col] = raw ?? null;
        }
      });

      return row;
    });

    console.log('🔍 Data API Debug - Final data transformation:', {
      responseMapSize: responses.size,
      finalDataLength: data.length,
      sampleAnswers: data[0] ? Object.keys(data[0]).filter(k => k.startsWith('Q')) : []
    });

    // Create column metadata for Python
    const columns = ['response_id', 'submitted_at'];
    const sampleDemo = data[0] ? Object.keys(data[0]).filter(k => k.startsWith('demo_')) : [];
    columns.push(...sampleDemo);
    qMeta.forEach((q: any) => {
      columns.push(q.col);
      if (q.isMulti && Array.isArray(q.options)) {
        q.options.forEach((opt: string) => columns.push(`${q.col}_${safe(opt)}`));
      }
    });

    // Enriched codebook: question text, type, options, and (for multi-select)
    // the exact 0/1 indicator column for each option.
    const questionMapping = qMeta.map((q: any) => ({
      column: q.col,
      question: q.prompt,
      type: q.type,
      multiSelect: q.isMulti,
      options: q.options,
      ...(q.isMulti && Array.isArray(q.options) ? {
        encoding: 'multi-select (select all that apply): the original column is a comma-joined string of selected options; for membership/cross-tab/regression use the per-option binary 0/1 indicator columns listed in indicatorColumns.',
        indicatorColumns: Object.fromEntries(q.options.map((opt: string) => [opt, `${q.col}_${safe(opt)}`])),
      } : {}),
    }));

    return NextResponse.json({
      surveyId: surveyIdNum,
      surveyTitle: (survey as any).title,
      data: data,
      columns: columns,
      shape: [data.length, columns.length],
      questionMapping: questionMapping,
      metadata: {
        source: 'database',
        exported_at: new Date().toISOString(),
        total_responses: data.length,
        total_questions: questionRows.length
      }
    });

  } catch (error) {
    console.error('Error exporting survey data:', error);
    return NextResponse.json(
      { 
        error: 'Failed to export survey data', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
} 