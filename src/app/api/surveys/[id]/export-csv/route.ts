import { NextRequest, NextResponse } from 'next/server';
import { SurveyRepo } from '@/app/utils/database/survey-repo';
import { openSql as getMySQLConnection } from '@/app/utils/database/db';
import { RowDataPacket } from 'mysql2/promise';

interface TableSchema {
  hasAnswerValue: boolean;
  hasAnswerCode: boolean;
  answerValueColumn: string;
  questionOrderColumn: string;
  responseIdColumn: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Auth – user ID should be attached by middleware
    const userIdHeader = request.headers.get('x-user-id');
    if (!userIdHeader) {
      return NextResponse.json({ error: 'User not authenticated' }, { status: 401 });
    }
    const userId = parseInt(userIdHeader);

    const { id: surveyId } = await params;
    const surveyIdNum = parseInt(surveyId);

    // First, verify the user owns this survey
    const survey = await SurveyRepo.getSurveyById(surveyIdNum, userId);

    if (!survey) {
      return NextResponse.json({ error: 'Survey not found' }, { status: 404 });
    }

    const db = await getMySQLConnection();

    // Dynamically discover the schema
    const schema = await discoverTableSchema(db);
    console.log('Discovered schema for survey', surveyIdNum, ':', schema);

    // Get survey questions for column headers using discovered schema
    const [questionRows] = await db.execute<RowDataPacket[]>(
      `SELECT * FROM survey_questions WHERE survey_id = ? ORDER BY ${schema.questionOrderColumn} ASC`,
      [surveyIdNum]
    );

    // Build dynamic query based on discovered schema
    const responseQuery = buildResponseQuery(schema, surveyIdNum);
    const [responseRows] = await db.execute<RowDataPacket[]>(responseQuery.sql, responseQuery.params);

    if (responseRows.length === 0) {
      return NextResponse.json({ error: 'No responses found' }, { status: 404 });
    }

    // Create CSV headers - use question order as column names for Python compatibility
    const headers = ['response_id', 'submitted_at', ...questionRows.map((q: any) => `Q${q[schema.questionOrderColumn]}`)];
    
    // Group responses by response ID
    const responseMap = new Map();
    responseRows.forEach((row: any) => {
      if (!responseMap.has(row.id)) {
        responseMap.set(row.id, {
          id: row.id,
          submitted_at: row.submitted_at,
          answers: new Map()
        });
      }
      if (row[schema.questionOrderColumn] !== null) {
        const answerValue = row[schema.answerValueColumn];
        responseMap.get(row.id).answers.set(row[schema.questionOrderColumn], answerValue);
      }
    });

    // Create CSV rows
    const csvRows = [headers.join(',')];
    
    responseMap.forEach((response: any) => {
      const row = [response.id, response.submitted_at?.toISOString() || ''];
      
      // Add answers in question order
      questionRows.forEach((question: any) => {
        const answer = response.answers.get(question[schema.questionOrderColumn]);
        // Handle different answer types and escape CSV values
        let csvValue = '';
        if (answer !== undefined && answer !== null) {
          if (typeof answer === 'string' && answer.includes(',')) {
            csvValue = `"${answer.replace(/"/g, '""')}"`;
          } else {
            csvValue = String(answer);
          }
        }
        row.push(csvValue);
      });
      
      csvRows.push(row.join(','));
    });

    const csvContent = csvRows.join('\n');

    // Return CSV with appropriate headers
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${(survey as any).slug || 'survey'}_responses.csv"`,
      },
    });

  } catch (error) {
    console.error('Error exporting survey CSV:', error);
    return NextResponse.json(
      { error: 'Failed to export survey data', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

async function discoverTableSchema(db: any): Promise<TableSchema> {
  try {
    // Check survey_answers table structure
    const [answerColumns] = await db.execute(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() 
       AND TABLE_NAME = 'survey_answers'`
    ) as [RowDataPacket[], any];

    // Check survey_questions table structure  
    const [questionColumns] = await db.execute(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() 
       AND TABLE_NAME = 'survey_questions'`
    ) as [RowDataPacket[], any];

    const answerColumnNames = answerColumns.map((col: any) => col.COLUMN_NAME);
    const questionColumnNames = questionColumns.map((col: any) => col.COLUMN_NAME);

    // Determine answer value column name
    let answerValueColumn = 'answer_value';
    if (answerColumnNames.includes('value')) {
      answerValueColumn = 'value';
    } else if (answerColumnNames.includes('answer_text')) {
      answerValueColumn = 'answer_text';
    } else if (answerColumnNames.includes('response_value')) {
      answerValueColumn = 'response_value';
    }

    // Determine question order column name
    let questionOrderColumn = 'question_order';
    if (questionColumnNames.includes('order')) {
      questionOrderColumn = 'order';
    } else if (questionColumnNames.includes('sort_order')) {
      questionOrderColumn = 'sort_order';
    } else if (questionColumnNames.includes('position')) {
      questionOrderColumn = 'position';
    }

    // Determine response ID column name
    let responseIdColumn = 'response_id';
    if (answerColumnNames.includes('survey_response_id')) {
      responseIdColumn = 'survey_response_id';
    }

    return {
      hasAnswerValue: answerColumnNames.includes(answerValueColumn),
      hasAnswerCode: answerColumnNames.includes('answer_code'),
      answerValueColumn,
      questionOrderColumn,
      responseIdColumn
    };

  } catch (error) {
    console.error('Error discovering table schema:', error);
    // Return default schema as fallback
    return {
      hasAnswerValue: true,
      hasAnswerCode: false,
      answerValueColumn: 'answer_value',
      questionOrderColumn: 'question_order',
      responseIdColumn: 'response_id'
    };
  }
}

function buildResponseQuery(schema: TableSchema, surveyId: number) {
  const sql = `
    SELECT sr.id, sr.submitted_at, sa.question_id, sa.${schema.answerValueColumn}, sq.${schema.questionOrderColumn} 
    FROM survey_responses sr
    LEFT JOIN survey_answers sa ON sr.id = sa.${schema.responseIdColumn}  
    LEFT JOIN survey_questions sq ON sa.question_id = sq.id
    WHERE sr.survey_id = ?
    ORDER BY sr.id, sq.${schema.questionOrderColumn}
  `;

  return {
    sql: sql.trim(),
    params: [surveyId]
  };
} 