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

    // Convert to array and ensure all questions have values (even if null)
    const data = Array.from(responses.values()).map(response => {
      const row: any = {
        response_id: response.response_id,
        submitted_at: response.submitted_at
      };
      
      // Add demographics if available
      if (response.demographics) {
        try {
          const demo = typeof response.demographics === 'string' 
            ? JSON.parse(response.demographics) 
            : response.demographics;
          Object.keys(demo).forEach(key => {
            row[`demo_${key}`] = demo[key];
          });
        } catch (e) {
          console.warn('Could not parse demographics:', e);
        }
      }
      
      // Add all question columns
      questionRows.forEach((q: any) => {
        const colName = `Q${q.question_order}`;
        row[colName] = response.answers[colName] || null;
      });
      
      return row;
    });
    
    console.log('🔍 Data API Debug - Final data transformation:', {
      responseMapSize: responses.size,
      finalDataLength: data.length,
      firstRow: data[0],
      sampleAnswers: data[0] ? Object.keys(data[0]).filter(k => k.startsWith('Q')) : []
    });

    // Create column metadata for Python
    const columns = ['response_id', 'submitted_at'];
    
    // Add demographic columns
    const sampleDemo = data[0] ? Object.keys(data[0]).filter(k => k.startsWith('demo_')) : [];
    columns.push(...sampleDemo);
    
    // Add question columns
    questionRows.forEach((q: any) => {
      columns.push(`Q${q.question_order}`);
    });

    // Create question mapping for codebook
    const questionMapping = questionRows.map((q: any) => ({
      column: `Q${q.question_order}`,
      question: q.prompt,
      type: q.type,
      options: q.options ? (typeof q.options === 'string' ? JSON.parse(q.options) : q.options) : null
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