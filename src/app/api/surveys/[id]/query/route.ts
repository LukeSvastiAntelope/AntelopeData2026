import { NextRequest, NextResponse } from 'next/server';
import { openSql } from '@/app/utils/database/db';

// Import the schema analysis functions
const { analyzeSurveySchema } = require('../../../../../../scripts/analyze-survey-schema.js');

interface QueryRequest {
  question: string;
  context?: string;
}

interface QueryResponse {
  answer: string;
  data: any;
  query_type: string;
  confidence: number;
  source: 'fact_sheet' | 'dynamic_query' | 'schema_analysis';
  sql_query?: string;
  execution_time_ms: number;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now();
  
  try {
    const userIdHeader = request.headers.get('x-user-id');
    if (!userIdHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = parseInt(userIdHeader);

    const resolvedParams = await params;
    const surveyId = parseInt(resolvedParams.id);
    
    if (isNaN(surveyId)) {
      return NextResponse.json({ error: 'Invalid survey ID' }, { status: 400 });
    }

    const body: QueryRequest = await request.json();
    
    if (!body.question || typeof body.question !== 'string') {
      return NextResponse.json({ error: 'Question is required' }, { status: 400 });
    }

    // Check if user has access to this survey
    const db = await openSql();
    const [surveyCheck] = await db.execute(`
      SELECT s.id, s.title, s.created_by, s.status
      FROM surveys s 
      WHERE s.id = ?
    `, [surveyId]);

    if (!surveyCheck || surveyCheck.length === 0) {
      return NextResponse.json({ error: 'Survey not found' }, { status: 404 });
    }

    const survey = surveyCheck[0] as any;
    
    // Check permissions
    if (survey.created_by !== userId && survey.status !== 'published') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    console.log(`🤔 Processing query for survey ${surveyId}: "${body.question}"`);

    // Get schema analysis using existing database connection (this should be cached in production)
    const schema = await analyzeSurveySchema(surveyId, db);
    
    // Process the query using our smart query system
    const response = await processSmartQuery(body.question, schema, db, surveyId);
    
    const executionTime = Date.now() - startTime;
    response.execution_time_ms = executionTime;

    console.log(`✅ Query processed in ${executionTime}ms, source: ${response.source}`);

    return NextResponse.json(response);

  } catch (error) {
    console.error('Query processing failed:', error);
    return NextResponse.json(
      { error: 'Failed to process query', details: error.message },
      { status: 500 }
    );
  }
}

// Smart query processing system
async function processSmartQuery(
  question: string,
  schema: any,
  db: any,
  surveyId: number
): Promise<QueryResponse> {
  
  const questionLower = question.toLowerCase();
  
  // Step 1: Try to answer from pre-computed fact sheet
  const factSheetAnswer = tryFactSheetAnswer(questionLower, schema);
  if (factSheetAnswer) {
    return factSheetAnswer;
  }
  
  // Step 2: Try pattern-based dynamic queries
  const dynamicAnswer = await tryDynamicQuery(questionLower, schema, db, surveyId);
  if (dynamicAnswer) {
    return dynamicAnswer;
  }
  
  // Step 3: Fallback to schema-based general answer
  return generateSchemaBasedAnswer(questionLower, schema);
}

// Try to answer from pre-computed fact sheet
function tryFactSheetAnswer(question: string, schema: any): QueryResponse | null {
  const factSheet = schema.fact_sheet;
  
  // Platform adoption questions
  if (question.includes('popular') && (question.includes('platform') || question.includes('social'))) {
    const platformStats = Object.values(factSheet.question_stats).find((stats: any) => 
      stats.adoption_rates && Object.keys(stats.adoption_rates).length > 0
    ) as any;
    
    if (platformStats) {
      const topPlatforms = Object.entries(platformStats.adoption_rates)
        .sort(([,a]: any, [,b]: any) => b.percentage - a.percentage)
        .slice(0, 5);
      
      const answer = `The top 5 most popular platforms are:\n${topPlatforms.map(([platform, stats]: any) => 
        `${stats.rank}. ${platform} - ${stats.percentage}% (${stats.users} users)`
      ).join('\n')}`;
      
      return {
        answer,
        data: { top_platforms: Object.fromEntries(topPlatforms) },
        query_type: 'platform_popularity',
        confidence: 0.95,
        source: 'fact_sheet',
        execution_time_ms: 0
      };
    }
  }
  
  // Usage time questions
  if ((question.includes('hour') || question.includes('time')) && (question.includes('average') || question.includes('mean'))) {
    const usageStats = Object.values(factSheet.question_stats).find((stats: any) => 
      stats.statistics && stats.statistics.mean !== undefined
    ) as any;
    
    if (usageStats) {
      const answer = `The average usage time is ${usageStats.statistics.mean} hours per day. The median is ${usageStats.statistics.median} hours, with usage ranging from ${usageStats.statistics.min} to ${usageStats.statistics.max} hours.`;
      
      return {
        answer,
        data: usageStats.statistics,
        query_type: 'usage_statistics',
        confidence: 0.9,
        source: 'fact_sheet',
        execution_time_ms: 0
      };
    }
  }
  
  // Demographics questions
  if (question.includes('age') && (question.includes('distribution') || question.includes('breakdown'))) {
    const ageDemo = schema.demographics.age;
    if (ageDemo && ageDemo.distribution) {
      const answer = `Age distribution:\n${Object.entries(ageDemo.distribution).map(([group, stats]: any) => 
        `${group}: ${stats.percentage}% (${stats.count} respondents)`
      ).join('\n')}`;
      
      return {
        answer,
        data: ageDemo.distribution,
        query_type: 'demographic_distribution',
        confidence: 0.9,
        source: 'fact_sheet',
        execution_time_ms: 0
      };
    }
  }
  
  // Sample size questions
  if (question.includes('how many') && (question.includes('respondent') || question.includes('people') || question.includes('user'))) {
    const totalRespondents = schema.survey_meta.total_respondents;
    const answer = `This survey has ${totalRespondents} respondents with a data quality score of ${(schema.survey_meta.data_quality_score * 100).toFixed(1)}%.`;
    
    return {
      answer,
      data: { 
        total_respondents: totalRespondents,
        data_quality_score: schema.survey_meta.data_quality_score,
        completion_rate: schema.survey_meta.response_completion_rate
      },
      query_type: 'sample_info',
      confidence: 1.0,
      source: 'fact_sheet',
      execution_time_ms: 0
    };
  }
  
  return null;
}

// Try dynamic SQL queries for more complex questions
async function tryDynamicQuery(
  question: string,
  schema: any,
  db: any,
  surveyId: number
): Promise<QueryResponse | null> {
  
  // Age group analysis
  if (question.includes('age') && (question.includes('group') || question.includes('young') || question.includes('old'))) {
    try {
      const query = `
        SELECT 
          CASE 
            WHEN JSON_EXTRACT(demographics, '$.age') BETWEEN 18 AND 29 THEN '18-29'
            WHEN JSON_EXTRACT(demographics, '$.age') BETWEEN 30 AND 49 THEN '30-49'
            WHEN JSON_EXTRACT(demographics, '$.age') BETWEEN 50 AND 64 THEN '50-64'
            WHEN JSON_EXTRACT(demographics, '$.age') >= 65 THEN '65+'
            ELSE 'Unknown'
          END as age_group,
          COUNT(*) as count,
          ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM survey_responses WHERE survey_id = ?), 1) as percentage
        FROM survey_responses 
        WHERE survey_id = ? AND demographics IS NOT NULL
        GROUP BY age_group
        ORDER BY 
          CASE age_group
            WHEN '18-29' THEN 1
            WHEN '30-49' THEN 2  
            WHEN '50-64' THEN 3
            WHEN '65+' THEN 4
            ELSE 5
          END
      `;
      
      const [results] = await db.execute(query, [surveyId, surveyId]);
      
      const answer = `Age group breakdown:\n${results.map((row: any) => 
        `${row.age_group}: ${row.percentage}% (${row.count} respondents)`
      ).join('\n')}`;
      
      return {
        answer,
        data: { age_groups: results },
        query_type: 'age_group_analysis',
        confidence: 0.85,
        source: 'dynamic_query',
        sql_query: query,
        execution_time_ms: 0
      };
      
    } catch (error) {
      console.warn('Dynamic age query failed:', error);
    }
  }
  
  // Gender analysis
  if (question.includes('gender') || question.includes('male') || question.includes('female')) {
    try {
      const query = `
        SELECT 
          JSON_EXTRACT(demographics, '$.gender') as gender,
          COUNT(*) as count,
          ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM survey_responses WHERE survey_id = ?), 1) as percentage
        FROM survey_responses 
        WHERE survey_id = ? AND demographics IS NOT NULL
        GROUP BY gender
        ORDER BY count DESC
      `;
      
      const [results] = await db.execute(query, [surveyId, surveyId]);
      
      const answer = `Gender distribution:\n${results.map((row: any) => 
        `${row.gender}: ${row.percentage}% (${row.count} respondents)`
      ).join('\n')}`;
      
      return {
        answer,
        data: { gender_distribution: results },
        query_type: 'gender_analysis',
        confidence: 0.85,
        source: 'dynamic_query',
        sql_query: query,
        execution_time_ms: 0
      };
      
    } catch (error) {
      console.warn('Dynamic gender query failed:', error);
    }
  }
  
  return null;
}

// Generate schema-based general answers
function generateSchemaBasedAnswer(question: string, schema: any): QueryResponse {
  
  // Question about survey structure
  if (question.includes('question') && (question.includes('how many') || question.includes('what'))) {
    const questionTypes = schema.questions.reduce((acc: any, q: any) => {
      acc[q.detected_type] = (acc[q.detected_type] || 0) + 1;
      return acc;
    }, {});
    
    const answer = `This survey contains ${schema.questions.length} questions:\n${Object.entries(questionTypes).map(([type, count]) => 
      `- ${count} ${type.replace('_', ' ')} question(s)`
    ).join('\n')}\n\nAvailable demographics: ${schema.survey_meta.demographics_available.join(', ')}`;
    
    return {
      answer,
      data: { 
        question_count: schema.questions.length,
        question_types: questionTypes,
        demographics: schema.survey_meta.demographics_available
      },
      query_type: 'survey_structure',
      confidence: 0.8,
      source: 'schema_analysis',
      execution_time_ms: 0
    };
  }
  
  // Data quality questions
  if (question.includes('quality') || question.includes('reliable')) {
    const dataQuality = schema.survey_meta.data_quality_score;
    const sampleSize = schema.survey_meta.total_respondents;
    
    let qualityAssessment = 'Good';
    if (dataQuality >= 0.9) qualityAssessment = 'Excellent';
    else if (dataQuality < 0.7) qualityAssessment = 'Fair';
    
    const answer = `Data Quality Assessment: ${qualityAssessment} (${(dataQuality * 100).toFixed(1)}%)\n\nSample Size: ${sampleSize} respondents\nCompletion Rate: ${schema.survey_meta.response_completion_rate}%\n\nThis dataset is ${sampleSize >= 100 ? 'highly' : sampleSize >= 30 ? 'moderately' : 'minimally'} suitable for statistical analysis.`;
    
    return {
      answer,
      data: {
        data_quality_score: dataQuality,
        sample_size: sampleSize,
        completion_rate: schema.survey_meta.response_completion_rate
      },
      query_type: 'data_quality',
      confidence: 0.9,
      source: 'schema_analysis',
      execution_time_ms: 0
    };
  }
  
  // Fallback: General survey info
  const answer = `This is "${schema.survey_meta.title}" with ${schema.survey_meta.total_respondents} respondents and ${schema.questions.length} questions. I can help you analyze platform adoption rates, usage patterns, demographic breakdowns, and more. Try asking specific questions like "What are the most popular platforms?" or "How does usage vary by age group?"`;
  
  return {
    answer,
    data: { 
      survey_title: schema.survey_meta.title,
      respondent_count: schema.survey_meta.total_respondents,
      question_count: schema.questions.length
    },
    query_type: 'general_info',
    confidence: 0.6,
    source: 'schema_analysis',
    execution_time_ms: 0
  };
} 