import { NextRequest, NextResponse } from 'next/server';
import { openSql } from '@/app/utils/database/db';

// Import the schema analysis functions
const { analyzeSurveySchema } = require('../../../../../../scripts/analyze-survey-schema.js');

interface SurveySchemaResponse {
  survey_meta: {
    id: number;
    title: string;
    description: string;
    total_respondents: number;
    question_count: number;
    demographics_available: string[];
    response_completion_rate: number;
    data_quality_score: number;
    status: string;
    created_at: string;
  };
  questions: Array<{
    id: number;
    type: string;
    prompt: string;
    options: any;
    detected_type: string;
    detection_confidence: number;
    unique_values: any[];
    value_count: number;
    response_patterns: any;
    analysis_potential: any;
    statistical_summary: any;
  }>;
  demographics: Record<string, any>;
  fact_sheet: {
    core_stats: any;
    question_stats: Record<string, any>;
  };
  analysis_metadata: {
    analyzed_at: string;
    version: string;
    total_data_points: number;
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
    
    // Check permissions - user must own the survey or it must be published
    if (survey.created_by !== userId && survey.status !== 'published') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    console.log(`🔍 Analyzing schema for survey ${surveyId}: "${survey.title}"`);

    // Perform schema analysis using existing database connection
    const schema: SurveySchemaResponse = await analyzeSurveySchema(surveyId, db);

    // Add some additional metadata and chart-ready data
    const enrichedSchema = {
      ...schema,
      access_info: {
        user_has_access: true,
        survey_owner: survey.created_by === userId,
        survey_status: survey.status,
        analysis_timestamp: new Date().toISOString()
      },
      usage_recommendations: generateUsageRecommendations(schema),
      chart_data: generateChartData(schema)
    };

    console.log(`✅ Schema analysis completed for survey ${surveyId}`);
    console.log(`📊 Found ${schema.questions.length} questions, ${Object.keys(schema.demographics).length} demographics`);

    return NextResponse.json(enrichedSchema);

  } catch (error) {
    console.error('Survey schema analysis failed:', error);
    return NextResponse.json(
      { error: 'Failed to analyze survey schema', details: error.message },
      { status: 500 }
    );
  }
}

// Generate usage recommendations based on schema analysis
function generateUsageRecommendations(schema: SurveySchemaResponse) {
  const recommendations = [];
  
  // Analyze question types for recommendations
  const questionTypes = schema.questions.reduce((acc, q) => {
    acc[q.detected_type] = (acc[q.detected_type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Multi-select questions
  if (questionTypes.multi_select > 0) {
    recommendations.push({
      type: 'analysis_opportunity',
      title: 'Platform Adoption Analysis',
      description: `${questionTypes.multi_select} multi-select question(s) detected. Perfect for analyzing adoption rates, platform combinations, and user segmentation.`,
      suggested_queries: [
        'What are the top 5 most popular platforms?',
        'Which platforms are commonly used together?',
        'How do platform preferences vary by age group?'
      ]
    });
  }

  // Numeric questions
  if (questionTypes.numeric > 0 || questionTypes.likert_scale > 0) {
    recommendations.push({
      type: 'analysis_opportunity',
      title: 'Usage Intensity Analysis',
      description: `${(questionTypes.numeric || 0) + (questionTypes.likert_scale || 0)} numeric question(s) detected. Great for usage patterns and intensity analysis.`,
      suggested_queries: [
        'What is the average usage time?',
        'How does usage vary by demographic?',
        'What percentage of users are heavy vs light users?'
      ]
    });
  }

  // Demographics analysis
  const demographicsCount = Object.keys(schema.demographics).length;
  if (demographicsCount > 0) {
    recommendations.push({
      type: 'analysis_opportunity',
      title: 'Demographic Segmentation',
      description: `${demographicsCount} demographic field(s) available. Enables deep demographic analysis and cross-tabulation.`,
      suggested_queries: [
        'How do responses vary by age group?',
        'What are the key differences between male and female users?',
        'Which demographic segments show the highest engagement?'
      ]
    });
  }

  // Data quality assessment
  const dataQualityScore = schema.survey_meta.data_quality_score;
  if (dataQualityScore >= 0.9) {
    recommendations.push({
      type: 'quality_assessment',
      title: 'High Data Quality',
      description: `Excellent data quality score (${(dataQualityScore * 100).toFixed(1)}%). All analysis types are reliable.`,
      confidence: 'high'
    });
  } else if (dataQualityScore >= 0.7) {
    recommendations.push({
      type: 'quality_assessment',
      title: 'Good Data Quality',
      description: `Good data quality score (${(dataQualityScore * 100).toFixed(1)}%). Most analysis types are reliable.`,
      confidence: 'medium'
    });
  } else {
    recommendations.push({
      type: 'quality_warning',
      title: 'Data Quality Concerns',
      description: `Lower data quality score (${(dataQualityScore * 100).toFixed(1)}%). Consider data cleaning before analysis.`,
      confidence: 'low'
    });
  }

  // Sample size assessment
  const sampleSize = schema.survey_meta.total_respondents;
  if (sampleSize >= 100) {
    recommendations.push({
      type: 'statistical_power',
      title: 'Strong Statistical Power',
      description: `Large sample size (${sampleSize} respondents). Statistical analyses will be highly reliable.`,
      confidence: 'high'
    });
  } else if (sampleSize >= 30) {
    recommendations.push({
      type: 'statistical_power',
      title: 'Moderate Statistical Power',
      description: `Moderate sample size (${sampleSize} respondents). Most analyses will be reliable.`,
      confidence: 'medium'
    });
  } else {
    recommendations.push({
      type: 'statistical_warning',
      title: 'Limited Statistical Power',
      description: `Small sample size (${sampleSize} respondents). Results should be interpreted with caution.`,
      confidence: 'low'
    });
  }

  return recommendations;
}

// Generate chart-ready data structures
function generateChartData(schema: SurveySchemaResponse) {
  const chartData: any = {
    platform_adoption: null,
    usage_distribution: null,
    demographics: {
      age: null,
      gender: null,
      education: null,
      location: null
    },
    question_types: null
  };

  // Platform adoption chart data
  const platformStats = Object.values(schema.fact_sheet.question_stats || {}).find((stats: any) => 
    stats.adoption_rates && Object.keys(stats.adoption_rates).length > 0
  ) as any;

  if (platformStats?.adoption_rates) {
    chartData.platform_adoption = Object.entries(platformStats.adoption_rates)
      .map(([platform, stats]: [string, any]) => ({
        name: platform,
        value: stats.percentage,
        users: stats.users,
        rank: stats.rank
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }

  // Usage distribution chart data
  const usageStats = Object.values(schema.fact_sheet.question_stats || {}).find((stats: any) => 
    stats.distribution && Object.keys(stats.distribution).length > 0
  ) as any;

  if (usageStats?.distribution) {
    chartData.usage_distribution = Object.entries(usageStats.distribution)
      .map(([range, stats]: [string, any]) => ({
        range: range.replace('_hours', 'h'),
        value: stats.percentage,
        count: stats.count
      }));
  }

  // Demographics chart data
  Object.entries(schema.demographics).forEach(([field, analysis]: [string, any]) => {
    if (analysis.distribution && chartData.demographics[field] !== undefined) {
      chartData.demographics[field] = Object.entries(analysis.distribution)
        .map(([category, stats]: [string, any]) => ({
          name: category,
          value: stats.percentage,
          count: stats.count
        }));
    }
  });

  // Question types distribution
  const questionTypes = schema.questions.reduce((acc: any, q: any) => {
    const type = q.detected_type.replace('_', ' ');
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});

  chartData.question_types = Object.entries(questionTypes)
    .map(([type, count]: [string, any]) => ({
      name: type,
      value: count,
      percentage: ((count / schema.questions.length) * 100).toFixed(1)
    }));

  return chartData;
}

// Optional: Add a POST endpoint for triggering schema re-analysis
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    // Check if user owns this survey
    const db = await openSql();
    const [surveyCheck] = await db.execute(`
      SELECT s.id, s.title, s.created_by
      FROM surveys s 
      WHERE s.id = ? AND s.created_by = ?
    `, [surveyId, userId]);

    if (!surveyCheck || surveyCheck.length === 0) {
      return NextResponse.json({ error: 'Survey not found or access denied' }, { status: 404 });
    }

    console.log(`🔄 Re-analyzing schema for survey ${surveyId}`);

    // Perform fresh schema analysis using existing database connection
    const schema = await analyzeSurveySchema(surveyId, db);

    // TODO: In production, you might want to cache this result
    // await cacheSchemaAnalysis(surveyId, schema);

    return NextResponse.json({
      message: 'Schema analysis completed',
      schema,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Schema re-analysis failed:', error);
    return NextResponse.json(
      { error: 'Failed to re-analyze survey schema', details: error.message },
      { status: 500 }
    );
  }
} 