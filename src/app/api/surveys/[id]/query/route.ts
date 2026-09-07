import { NextRequest, NextResponse } from 'next/server';
import { SurveyRepo } from '@/app/utils/database/survey-repo';
import { openSql as getMySQLConnection } from '@/app/utils/database/db';
import { RowDataPacket } from 'mysql2/promise';

interface QueryRequest {
  question: string;
  surveyId: string;
}

interface DatabaseSchema {
  questionTable: string;
  responseTable: string;
  answerTable: string;
  questionOrderColumn: string;
  questionTextColumn: string;
  answerValueColumn: string;
  responseIdColumn: string;
}

export async function POST(
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
    const { question } = await request.json() as QueryRequest;

    // Verify the user owns this survey
    const survey = await SurveyRepo.getSurveyById(surveyIdNum, userId);
    if (!survey) {
      return NextResponse.json({ error: 'Survey not found' }, { status: 404 });
    }

    // Discover database schema for this survey
    const db = await getMySQLConnection();
    const schema = await discoverDatabaseSchema(db);
    
    // Smart routing based on question type
    const response = await routeQuery(question, surveyIdNum, survey, schema);
    
    return NextResponse.json({
      question,
      answer: response.answer,
      queryType: response.type,
      data: response.data || null,
      executedAt: new Date().toISOString(),
      schemaUsed: schema
    });

  } catch (error) {
    console.error('Error processing survey query:', error);
    return NextResponse.json(
      { error: 'Failed to process query', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

async function discoverDatabaseSchema(db: any): Promise<DatabaseSchema> {
  try {
    // Check what tables exist
    const [tables] = await db.execute(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
       WHERE TABLE_SCHEMA = DATABASE() 
       AND TABLE_NAME IN ('survey_questions', 'survey_responses', 'survey_answers')`
    ) as [RowDataPacket[], any];

    const tableNames = tables.map((t: any) => t.TABLE_NAME);

    // Check column structures
    const [questionColumns] = await db.execute(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() 
       AND TABLE_NAME = 'survey_questions'`
    ) as [RowDataPacket[], any];

    const [answerColumns] = await db.execute(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() 
       AND TABLE_NAME = 'survey_answers'`
    ) as [RowDataPacket[], any];

    const questionColumnNames = questionColumns.map((col: any) => col.COLUMN_NAME);
    const answerColumnNames = answerColumns.map((col: any) => col.COLUMN_NAME);

    // Determine column mappings
    let questionOrderColumn = 'question_order';
    if (questionColumnNames.includes('order')) {
      questionOrderColumn = 'order';
    } else if (questionColumnNames.includes('sort_order')) {
      questionOrderColumn = 'sort_order';
    }

    let questionTextColumn = 'question_text';
    if (questionColumnNames.includes('prompt')) {
      questionTextColumn = 'prompt';
    } else if (questionColumnNames.includes('text')) {
      questionTextColumn = 'text';
    }

    let answerValueColumn = 'answer_value';
    if (answerColumnNames.includes('value')) {
      answerValueColumn = 'value';
    } else if (answerColumnNames.includes('answer_text')) {
      answerValueColumn = 'answer_text';
    }

    let responseIdColumn = 'response_id';
    if (answerColumnNames.includes('survey_response_id')) {
      responseIdColumn = 'survey_response_id';
    }

    return {
      questionTable: 'survey_questions',
      responseTable: 'survey_responses', 
      answerTable: 'survey_answers',
      questionOrderColumn,
      questionTextColumn,
      answerValueColumn,
      responseIdColumn
    };

  } catch (error) {
    console.error('Error discovering database schema:', error);
    // Return default schema
    return {
      questionTable: 'survey_questions',
      responseTable: 'survey_responses',
      answerTable: 'survey_answers', 
      questionOrderColumn: 'question_order',
      questionTextColumn: 'question_text',
      answerValueColumn: 'answer_value',
      responseIdColumn: 'response_id'
    };
  }
}

async function routeQuery(question: string, surveyId: number, survey: any, schema: DatabaseSchema) {
  const questionLower = question.toLowerCase();
  const db = await getMySQLConnection();

  // Route 1: Survey metadata queries
  if (questionLower.includes('question') && (questionLower.includes('list') || questionLower.includes('what') || questionLower.includes('show'))) {
    const questions = survey.questions.map((q: any, index: number) => ({
      order: q[schema.questionOrderColumn],
      text: q[schema.questionTextColumn] || q.question_text,
      type: q.question_type,
      options: q.options || []
    }));

    return {
      type: 'metadata',
      answer: `This survey contains ${questions.length} questions:\n\n` + 
        questions.map((q: any) => `**Q${q.order}**: ${q.text}${q.options.length > 0 ? `\n   Options: ${q.options.join(', ')}` : ''}`).join('\n\n'),
      data: questions
    };
  }

  // Route 2: Response count queries (schema-aware)
  if (questionLower.includes('response') && (questionLower.includes('how many') || questionLower.includes('count') || questionLower.includes('total'))) {
    const [countResult] = await db.execute(
      `SELECT COUNT(*) as total FROM ${schema.responseTable} WHERE survey_id = ?`,
      [surveyId]
    ) as [RowDataPacket[], any];
    const total = (countResult[0] as any).total;

    return {
      type: 'database',
      answer: `This survey has **${total.toLocaleString()} total responses**.`,
      data: { responseCount: total }
    };
  }

  // Route 3: Survey status and metadata
  if (questionLower.includes('status') || questionLower.includes('when') || questionLower.includes('created')) {
    const surveyInfo = survey as any;
    
    return {
      type: 'metadata', 
      answer: `**Survey Information:**
- **Title**: ${surveyInfo.title || surveyInfo.slug}
- **Status**: ${surveyInfo.status}
- **Created**: ${new Date(surveyInfo.created_at).toLocaleDateString()}
- **Questions**: ${survey.questions.length}
- **Type**: ${surveyInfo.survey_type || 'Standard'}
- **Database Schema**: Using ${schema.questionTable}, ${schema.answerTable}, ${schema.responseTable}`,
      data: {
        title: surveyInfo.title,
        status: surveyInfo.status,
        createdAt: surveyInfo.created_at,
        questionCount: survey.questions.length,
        schema: schema
      }
    };
  }

  // Route 4: Question-specific analysis (requires aggregation)
  if (questionLower.includes('breakdown') || questionLower.includes('distribution') || questionLower.includes('answer')) {
    // For complex analysis, recommend Python analysis
    return {
      type: 'recommendation',
      answer: `For detailed response analysis and breakdowns, I recommend using the **Python Analysis Engine** which can:

📊 **Analyze response distributions**
📈 **Create visualizations** 
🔍 **Find correlations**
📋 **Generate statistical summaries**

The analysis engine has full access to all ${(await getResponseCount(surveyId, db, schema)).toLocaleString()} responses without token limitations.

Would you like me to run a Python analysis on this data?`,
      data: { recommendPythonAnalysis: true }
    };
  }

  // Route 5: Demographics queries
  if (questionLower.includes('demographic') || questionLower.includes('age') || questionLower.includes('gender') || questionLower.includes('location')) {
    return {
      type: 'recommendation',
      answer: `For demographic analysis, the **Python Analysis Engine** can automatically:

👥 **Identify demographic questions**
📊 **Create demographic breakdowns**
🗺️ **Generate cross-tabulations**
📈 **Show response patterns by demographics**

This provides much richer insights than simple database queries.

Would you like me to analyze demographics using Python?`,
      data: { recommendPythonAnalysis: true, analysisType: 'demographics' }
    };
  }

  // Default: General information
  return {
    type: 'general',
    answer: `I can help you with this survey data in several ways:

🔍 **Direct Database Queries** (instant, no token limits):
- List survey questions
- Get response counts
- Check survey status and metadata

🐍 **Python Analysis Engine** (for complex analysis):
- Response distributions and statistics
- Correlations and patterns
- Data visualizations
- Advanced breakdowns

**Current Survey**: ${survey.questions.length} questions, ${(await getResponseCount(surveyId, db, schema)).toLocaleString()} responses
**Database Schema**: ${schema.questionTable} → ${schema.answerTable} → ${schema.responseTable}

What specific information would you like to know?`,
    data: {
      surveyInfo: {
        questionCount: survey.questions.length,
        responseCount: await getResponseCount(surveyId, db, schema)
      },
      schema: schema
    }
  };
}

async function getResponseCount(surveyId: number, db: any, schema: DatabaseSchema): Promise<number> {
  try {
    const [countResult] = await db.execute(
      `SELECT COUNT(*) as total FROM ${schema.responseTable} WHERE survey_id = ?`,
      [surveyId]
    ) as [RowDataPacket[], any];
    return (countResult[0] as any).total || 0;
  } catch (error) {
    console.error('Error getting response count:', error);
    return 0;
  }
} 