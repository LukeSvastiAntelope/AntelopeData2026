// AI Analytics API - Generate and retrieve AI-powered survey analytics
import { NextRequest, NextResponse } from 'next/server';
import { AIAnalyticsOrchestrator, AIAnalyticsConfig } from '@/app/utils/services/ai-analytics-orchestrator';
import { getAllModels } from '@/app/utils/models';
import { openSql } from '@/app/utils/database/db';

// GET /api/surveys/[id]/ai-analytics - Get existing analytics or status
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const surveyId = parseInt(id);
    
    if (isNaN(surveyId)) {
      return NextResponse.json({ 
        error: 'Invalid survey ID' 
      }, { status: 400 });
    }

    // Initialize orchestrator with default models
    const orchestrator = new AIAnalyticsOrchestrator();
    
    // Get analytics status
    const status = await orchestrator.getAnalyticsStatus(surveyId);
    
    if (!status.hasAnalytics) {
      return NextResponse.json({
        hasAnalytics: false,
        responseCount: status.responseCount,
        availableModels: {
          analysis: getAllModels().filter(m => 
            ['gpt-4o', 'gpt-4o', 'o1', 'gemini-2.0-flash'].includes(m.id)
          ),
          queries: getAllModels().filter(m => 
            ['gpt-4o-mini', 'gpt-4o-mini', 'deepseek-chat'].includes(m.id)
          ),
          insights: getAllModels().filter(m => 
            ['gpt-4o', 'gpt-4o', 'o1'].includes(m.id)
          ),
          visualization: getAllModels().filter(m => 
            ['gpt-4o', 'gpt-4o', 'gemini-2.0-flash'].includes(m.id)
          )
        },
        recommendedModels: {
          analysis: 'gpt-4o',
          queries: 'gpt-4o-mini', 
          insights: 'gpt-4o',
          visualization: 'gpt-4o'
        },
        minimumResponses: 10,
        message: status.responseCount < 10 
          ? `Survey needs at least 10 responses for analytics. Current: ${status.responseCount}`
          : 'Analytics not generated yet. Use POST to generate.'
      });
    }

    // Fetch full cached analytics data - Use two-step approach to avoid sort buffer issues
    const db = await openSql();
    
    // First, get the ID of the most recent completed analytics (without the large data column)
    const [latestRecord] = await db.execute(
      `SELECT id FROM survey_analytics_cache 
       WHERE survey_id = ? AND status = 'completed' 
       ORDER BY created_at DESC LIMIT 1`,
      [surveyId]
    ) as any[];

    let analyticsData: any = null;
    if (latestRecord && latestRecord.length > 0) {
      // Second, fetch the analytics data for that specific record
      const [cachedRow] = await db.execute(
        `SELECT analytics_data FROM survey_analytics_cache WHERE id = ?`,
        [latestRecord[0].id]
      ) as any[];
      
      if (cachedRow && cachedRow.length > 0) {
        try {
          analyticsData = typeof cachedRow[0].analytics_data === 'string'
            ? JSON.parse(cachedRow[0].analytics_data)
            : cachedRow[0].analytics_data;
        } catch(e) {
          console.error('Failed to parse cached analytics JSON', e);
        }
      }
    }

    return NextResponse.json({
      hasAnalytics: true,
      lastGenerated: status.lastGenerated,
      responseCount: status.responseCount,
      cacheStatus: status.cacheStatus,
      ...(analyticsData || {}),
      availableActions: {
        regenerate: 'POST with forceRegenerate=true',
        clearCache: 'DELETE to clear cache',
        partialRegenerate: 'POST with specific force flags'
      }
    });

  } catch (error) {
    console.error('Error getting analytics status:', error);
    return NextResponse.json({ 
      error: 'Failed to get analytics status',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// POST /api/surveys/[id]/ai-analytics - Generate analytics
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const surveyId = parseInt(id);
    
    if (isNaN(surveyId)) {
      return NextResponse.json({ 
        error: 'Invalid survey ID' 
      }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    
    // Extract configuration from request body
    const config: AIAnalyticsConfig = {
      // Model selection
      analysisModel: body.analysisModel || 'gpt-4o',
      queryModel: body.queryModel || 'gpt-4o-mini',
      insightModel: body.insightModel || 'gpt-4o',
      visualizationModel: body.visualizationModel || 'gpt-4o',
      
      // Force regeneration options
      forceRegenerate: body.forceRegenerate || false,
      forceRegenerateAnalysis: body.forceRegenerateAnalysis || false,
      forceRegenerateQueries: body.forceRegenerateQueries || false,
      forceRegenerateInsights: body.forceRegenerateInsights || false,
      forceRegenerateVisualizations: body.forceRegenerateVisualizations || false,
      
      // Cache settings - Updated defaults for longer persistence
      cacheExpirationHours: body.cacheExpirationHours || 720, // 30 days instead of 24 hours
      analysisCacheHours: body.analysisCacheHours || 720, // 30 days instead of 48 hours
      queryCacheHours: body.queryCacheHours || 720, // 30 days instead of 24 hours
      insightsCacheHours: body.insightsCacheHours || 720, // 30 days instead of 48 hours
      visualizationCacheHours: body.visualizationCacheHours || 720, // 30 days instead of 24 hours
      
      // Quality settings
      minimumResponses: body.minimumResponses || 10,
      maxCharts: body.maxCharts || 12,
      includeRawData: body.includeRawData || false
    };

    // Validate models are available
    const availableModels = getAllModels().map(m => m.id);
    const modelFields = ['analysisModel', 'queryModel', 'insightModel', 'visualizationModel'] as const;
    
    for (const field of modelFields) {
      const model = config[field];
      if (model && !availableModels.includes(model)) {
        return NextResponse.json({
          error: `Invalid ${field}: ${model}`,
          availableModels: availableModels
        }, { status: 400 });
      }
    }

    console.log(`Starting AI analytics generation for survey ${surveyId} with config:`, {
      models: {
        analysis: config.analysisModel,
        queries: config.queryModel,
        insights: config.insightModel,
        visualization: config.visualizationModel
      },
      forceFlags: {
        analysis: config.forceRegenerateAnalysis,
        queries: config.forceRegenerateQueries,
        insights: config.forceRegenerateInsights,
        visualizations: config.forceRegenerateVisualizations
      }
    });

    // Initialize orchestrator with configuration
    const orchestrator = new AIAnalyticsOrchestrator(config);
    
    // Generate analytics
    const result = await orchestrator.generateCompleteAnalytics(surveyId, config);
    
    // Return successful result
    return NextResponse.json({
      success: true,
      surveyId: result.surveyId,
      status: result.status,
      performance: result.performance,
      dataQuality: result.dataQuality,
      metadata: result.metadata,
      summary: {
        analysisType: result.analysis?.surveyType,
        keyThemes: result.analysis?.mainThemes,
        keyFindingsCount: result.insights?.keyFindings?.length || 0,
        recommendationsCount: result.insights?.recommendations?.length || 0,
        chartsGenerated: result.dashboard?.charts?.length || 0,
        totalTimeSeconds: Math.round(result.performance.totalTimeMs / 1000)
      },
      // Include full data if requested
      ...(config.includeRawData && {
        analysis: result.analysis,
        insights: result.insights,
        dashboard: result.dashboard,
        queryResults: result.queryResults
      })
    });

  } catch (error) {
    console.error('Error generating analytics:', error);
    
    return NextResponse.json({ 
      success: false,
      error: 'Failed to generate analytics',
      details: error instanceof Error ? error.message : 'Unknown error',
      troubleshooting: {
        commonIssues: [
          'Insufficient survey responses (minimum 10 required)',
          'Invalid model selection',
          'Database connection issues',
          'AI service rate limits'
        ],
        suggestions: [
          'Check survey has enough responses',
          'Try different model combinations',
          'Use forceRegenerate=false to use cached data',
          'Reduce maxCharts if generation is slow'
        ]
      }
    }, { status: 500 });
  }
}

// DELETE /api/surveys/[id]/ai-analytics - Clear analytics cache
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const surveyId = parseInt(id);
    
    if (isNaN(surveyId)) {
      return NextResponse.json({ 
        error: 'Invalid survey ID' 
      }, { status: 400 });
    }

    // Initialize orchestrator
    const orchestrator = new AIAnalyticsOrchestrator();
    
    // Clear cache
    await orchestrator.clearAnalyticsCache(surveyId);
    
    return NextResponse.json({
      success: true,
      message: `Analytics cache cleared for survey ${surveyId}`,
      nextSteps: {
        regenerate: `POST /api/surveys/${surveyId}/ai-analytics`,
        checkStatus: `GET /api/surveys/${surveyId}/ai-analytics`
      }
    });

  } catch (error) {
    console.error('Error clearing analytics cache:', error);
    return NextResponse.json({ 
      error: 'Failed to clear analytics cache',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 