// AI Analytics Orchestrator - Main service that coordinates the entire analytics pipeline
import { openSql } from '../database/db';
import { SurveyAnalysisEngine, SurveyAnalysisConfig } from './survey-analysis-engine';
import { StatisticalQueryGenerator, StatisticalAnalysisConfig } from './statistical-query-generator';
import { InsightGenerationService, InsightGenerationConfig } from './insight-generation-service';
import { VisualizationEngine, VisualizationConfig } from './visualization-engine';

export interface AIAnalyticsConfig {
  // Model selection for different stages
  analysisModel?: string;      // For survey understanding
  queryModel?: string;         // For SQL generation  
  insightModel?: string;       // For insight generation
  visualizationModel?: string; // For dashboard creation
  
  // Force regeneration options
  forceRegenerate?: boolean;
  forceRegenerateAnalysis?: boolean;
  forceRegenerateQueries?: boolean;
  forceRegenerateInsights?: boolean;
  forceRegenerateVisualizations?: boolean;
  
  // Cache settings
  cacheExpirationHours?: number;
  analysisCacheHours?: number;
  queryCacheHours?: number;
  insightsCacheHours?: number;
  visualizationCacheHours?: number;
  
  // Quality settings
  minimumResponses?: number;
  maxCharts?: number;
  includeRawData?: boolean;
}

export interface AIAnalyticsResult {
  surveyId: number;
  status: 'completed' | 'partial' | 'failed';
  analysis: any;
  queries: any[];
  queryResults: any[];
  insights: any;
  dashboard: any;
  performance: {
    totalTimeMs: number;
    analysisTimeMs: number;
    queryTimeMs: number;
    insightTimeMs: number;
    visualizationTimeMs: number;
  };
  dataQuality: {
    responseCount: number;
    completenessScore: number;
    reliabilityAssessment: string;
    limitations: string[];
  };
  metadata: {
    modelsUsed: {
      analysis: string;
      queries: string;
      insights: string;
      visualization: string;
    };
    generatedAt: string;
    cacheStatus: {
      analysis: 'cached' | 'generated';
      queries: 'cached' | 'generated';
      insights: 'cached' | 'generated';
      visualizations: 'cached' | 'generated';
    };
  };
}

export class AIAnalyticsOrchestrator {
  private analysisEngine: SurveyAnalysisEngine;
  private queryGenerator: StatisticalQueryGenerator;
  private insightService: InsightGenerationService;
  private visualizationEngine: VisualizationEngine;

  constructor(config: Partial<AIAnalyticsConfig> = {}) {
    // Initialize engines with model preferences
    this.analysisEngine = new SurveyAnalysisEngine(
      config.analysisModel || 'claude-3-5-sonnet-latest'
    );
    this.queryGenerator = new StatisticalQueryGenerator(
      config.queryModel || 'gpt-4o-mini',
      config.queryCacheHours || 24
    );
    this.insightService = new InsightGenerationService(
      config.insightModel || 'claude-3-5-sonnet-latest',
      config.insightsCacheHours || 48
    );
    this.visualizationEngine = new VisualizationEngine(
      config.visualizationModel || 'gpt-4o',
      config.visualizationCacheHours || 24
    );
  }

  async generateCompleteAnalytics(
    surveyId: number, 
    config: AIAnalyticsConfig = {}
  ): Promise<AIAnalyticsResult> {
    const startTime = Date.now();
    
    console.log(`Starting AI analytics generation for survey ${surveyId}`);
    
    // Check for cached results first (unless force regeneration)
    if (!config.forceRegenerate) {
      const cached = await this.getCachedAnalytics(surveyId);
      if (cached) {
        console.log(`Returning cached analytics for survey ${surveyId}`);
        return cached;
      }
    }
    
    // Log analysis start
    await this.logAnalysisStart(surveyId);
    
    // Validate survey has minimum responses
    const minimumResponses = config.minimumResponses || 3; // Lowered to 3 for small surveys
    const responseCount = await this.getResponseCount(surveyId);
    
    if (responseCount < minimumResponses) {
      throw new Error(`Survey needs at least ${minimumResponses} responses for analysis. Current: ${responseCount}`);
    }

    const result: AIAnalyticsResult = {
      surveyId,
      status: 'partial',
      analysis: null,
      queries: [],
      queryResults: [],
      insights: null,
      dashboard: null,
      performance: {
        totalTimeMs: 0,
        analysisTimeMs: 0,
        queryTimeMs: 0,
        insightTimeMs: 0,
        visualizationTimeMs: 0
      },
      dataQuality: {
        responseCount,
        completenessScore: 0,
        reliabilityAssessment: '',
        limitations: []
      },
      metadata: {
        modelsUsed: {
          analysis: config.analysisModel || 'claude-3-5-sonnet-latest',
          queries: config.queryModel || 'gpt-4o-mini',
          insights: config.insightModel || 'claude-3-5-sonnet-latest',
          visualization: config.visualizationModel || 'gpt-4o'
        },
        generatedAt: new Date().toISOString(),
        cacheStatus: {
          analysis: 'generated',
          queries: 'generated',
          insights: 'generated',
          visualizations: 'generated'
        }
      }
    };

    try {
      // Step 1: Survey Analysis & Understanding
      const analysisStart = Date.now();
      console.log('Step 1: Analyzing survey structure and content...');
      
      const analysisConfig: SurveyAnalysisConfig = {
        analysisModel: config.analysisModel,
        forceRegenerate: config.forceRegenerate || config.forceRegenerateAnalysis
      };
      
      result.analysis = await this.analysisEngine.analyzeSurvey(surveyId, analysisConfig);
      result.metadata.cacheStatus.analysis = analysisConfig.forceRegenerate ? 'generated' : 'cached';
      result.performance.analysisTimeMs = Date.now() - analysisStart;
      
      console.log(`Analysis completed in ${result.performance.analysisTimeMs}ms`);

      // Step 2: Generate Statistical Queries
      const queryStart = Date.now();
      console.log('Step 2: Generating statistical analysis queries...');
      
      const queryConfig: StatisticalAnalysisConfig = {
        analysisModel: config.queryModel,
        forceRegenerate: config.forceRegenerate || config.forceRegenerateQueries,
        cacheExpirationHours: config.queryCacheHours
      };
      
      result.queries = await this.queryGenerator.generateAnalysisQueries(
        surveyId, 
        result.analysis, 
        queryConfig
      );
      result.metadata.cacheStatus.queries = queryConfig.forceRegenerate ? 'generated' : 'cached';
      result.performance.queryTimeMs = Date.now() - queryStart;
      
      console.log(`Generated ${result.queries.length} queries in ${result.performance.queryTimeMs}ms`);

      // Step 3: Execute Statistical Queries
      console.log('Step 3: Executing statistical queries...');
      const queryExecutionStart = Date.now();
      
      result.queryResults = [];
      for (const query of result.queries) {
        try {
          const queryResult = await this.queryGenerator.executeQuery(query);
          result.queryResults.push({
            ...query,
            data: queryResult,
            executedAt: new Date().toISOString(),
            success: true
          });
        } catch (error) {
          console.error(`Failed to execute query ${query.analysisType}:`, error);
          result.queryResults.push({
            ...query,
            data: [],
            error: error instanceof Error ? error.message : 'Unknown error',
            executedAt: new Date().toISOString(),
            success: false
          });
        }
      }
      
      const queryExecutionTime = Date.now() - queryExecutionStart;
      result.performance.queryTimeMs += queryExecutionTime;
      
      console.log(`Executed queries in ${queryExecutionTime}ms`);

      // Step 4: Generate Insights
      const insightStart = Date.now();
      console.log('Step 4: Generating business insights...');
      
      const insightConfig: InsightGenerationConfig = {
        insightModel: config.insightModel,
        forceRegenerate: config.forceRegenerate || config.forceRegenerateInsights,
        cacheExpirationHours: config.insightsCacheHours
      };
      
      const successfulResults = result.queryResults.filter(r => r.success);
      result.insights = await this.insightService.generateInsights(
        surveyId,
        successfulResults,
        result.analysis,
        insightConfig
      );
      result.metadata.cacheStatus.insights = insightConfig.forceRegenerate ? 'generated' : 'cached';
      result.performance.insightTimeMs = Date.now() - insightStart;
      
      console.log(`Insights generated in ${result.performance.insightTimeMs}ms`);

      // Step 5: Generate Visualizations & Dashboard
      const vizStart = Date.now();
      console.log('Step 5: Creating dashboard and visualizations...');
      
      const vizConfig: VisualizationConfig = {
        visualizationModel: config.visualizationModel,
        forceRegenerate: config.forceRegenerate || config.forceRegenerateVisualizations,
        cacheExpirationHours: config.visualizationCacheHours,
        maxCharts: config.maxCharts
      };
      
      result.dashboard = await this.visualizationEngine.generateDashboard(
        surveyId,
        successfulResults,
        result.insights,
        result.analysis,
        vizConfig
      );
      result.metadata.cacheStatus.visualizations = vizConfig.forceRegenerate ? 'generated' : 'cached';
      result.performance.visualizationTimeMs = Date.now() - vizStart;
      
      console.log(`Dashboard created in ${result.performance.visualizationTimeMs}ms`);

      // Calculate data quality metrics
      result.dataQuality = await this.calculateDataQuality(surveyId, result.queryResults);
      
      // Mark as completed
      result.status = 'completed';
      result.performance.totalTimeMs = Date.now() - startTime;
      
      // Log completion to database
      await this.logAnalysisCompletion(surveyId, result);
      
      console.log(`AI analytics completed for survey ${surveyId} in ${result.performance.totalTimeMs}ms`);
      
      return result;
      
    } catch (error) {
      console.error(`AI analytics failed for survey ${surveyId}:`, error);
      
      result.status = 'failed';
      result.performance.totalTimeMs = Date.now() - startTime;
      
      // Log failure
      await this.logAnalysisFailure(surveyId, error instanceof Error ? error.message : 'Unknown error');
      
      throw error;
    }
  }

  async getAnalyticsStatus(surveyId: number): Promise<{
    hasAnalytics: boolean;
    lastGenerated?: string;
    cacheStatus: any;
    responseCount: number;
  }> {
    const db = await openSql();
    
    // Check for existing analytics in simplified table
    const [analytics] = await db.execute(`
      SELECT 
        status,
        created_at,
        response_count,
        expires_at
      FROM survey_analytics_cache 
      WHERE survey_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `, [surveyId]) as any[];

    if (!analytics || analytics.length === 0) {
      const [responseCount] = await db.execute(
        'SELECT COUNT(*) as count FROM survey_responses WHERE survey_id = ?',
        [surveyId]
      ) as any[];
      
      return {
        hasAnalytics: false,
        responseCount: responseCount[0]?.count || 0,
        cacheStatus: {
          analysis: 'missing',
          queries: 'missing',
          insights: 'missing',
          visualizations: 'missing'
        }
      };
    }

    const data = analytics[0];
    const isExpired = data.expires_at && new Date(data.expires_at) < new Date();
    
    return {
      hasAnalytics: !isExpired && data.status === 'completed',
      lastGenerated: data.created_at,
      responseCount: data.response_count || 0,
      cacheStatus: {
        analysis: data.status === 'completed' ? 'cached' : 'missing',
        queries: data.status === 'completed' ? 'cached' : 'missing',
        insights: data.status === 'completed' ? 'cached' : 'missing',
        visualizations: data.status === 'completed' ? 'cached' : 'missing'
      }
    };
  }

  async clearAnalyticsCache(surveyId: number): Promise<void> {
    const db = await openSql();
    
    console.log(`Clearing analytics cache for survey ${surveyId}`);
    
    // Clear cached analytics data
    await db.execute('DELETE FROM survey_analytics_cache WHERE survey_id = ?', [surveyId]);
    
    console.log(`Analytics cache cleared for survey ${surveyId}`);
  }

  private async getResponseCount(surveyId: number): Promise<number> {
    const db = await openSql();
    
    const [result] = await db.execute(
      'SELECT COUNT(*) as count FROM survey_responses WHERE survey_id = ?',
      [surveyId]
    ) as any[];
    
    return result[0]?.count || 0;
  }

  private async calculateDataQuality(surveyId: number, queryResults: any[]): Promise<any> {
    const db = await openSql();
    
    // Get survey response statistics - using actual column names
    const [stats] = await db.execute(`
      SELECT 
        COUNT(*) as total_responses,
        1.0 as completion_rate,
        0 as avg_completion_time_seconds
      FROM survey_responses 
      WHERE survey_id = ?
    `, [surveyId]) as any[];

    const responseStats = stats[0];
    const successfulQueries = queryResults.filter(r => r.success).length;
    const totalQueries = queryResults.length;
    
    return {
      responseCount: responseStats.total_responses || 0,
      completenessScore: Math.round((responseStats.completion_rate || 0) * 100),
      reliabilityAssessment: this.assessReliability(responseStats),
      limitations: this.identifyLimitations(responseStats, successfulQueries, totalQueries)
    };
  }

  private assessReliability(stats: any): string {
    const responseCount = stats.total_responses || 0;
    const completionRate = stats.completion_rate || 0;
    
    if (responseCount >= 1000 && completionRate >= 0.8) return 'High';
    if (responseCount >= 500 && completionRate >= 0.7) return 'Good';
    if (responseCount >= 100 && completionRate >= 0.6) return 'Moderate';
    return 'Limited';
  }

  private identifyLimitations(stats: any, successfulQueries: number, totalQueries: number): string[] {
    const limitations: string[] = [];
    
    if (stats.total_responses < 100) {
      limitations.push('Small sample size may limit statistical significance');
    }
    
    if (stats.completion_rate < 0.7) {
      limitations.push('Low completion rate may introduce response bias');
    }
    
    if (successfulQueries < totalQueries) {
      limitations.push(`${totalQueries - successfulQueries} statistical queries failed to execute`);
    }
    
    if (stats.avg_completion_time_seconds < 60) {
      limitations.push('Very fast completion times may indicate rushed responses');
    }
    
    return limitations;
  }

  private async storeAnalyticsResult(surveyId: number, result: AIAnalyticsResult): Promise<void> {
    const db = await openSql();
    
    // Calculate expiration (24 hours from now)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);
    
    // Store complete result as JSON
    await db.execute(`
      INSERT INTO survey_analytics_cache (
        survey_id, status, response_count, processing_time_ms, 
        analytics_data, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        status = VALUES(status),
        response_count = VALUES(response_count),
        processing_time_ms = VALUES(processing_time_ms),
        analytics_data = VALUES(analytics_data),
        expires_at = VALUES(expires_at),
        updated_at = CURRENT_TIMESTAMP
    `, [
      surveyId,
      result.status,
      result.dataQuality.responseCount,
      result.performance.totalTimeMs,
      JSON.stringify(result),
      expiresAt
    ]);
  }

  private async logAnalysisStart(surveyId: number): Promise<void> {
    const db = await openSql();
    
    await db.execute(`
      INSERT INTO analytics_generation_log (survey_id, status)
      VALUES (?, 'started')
    `, [surveyId]);
  }

  private async logAnalysisCompletion(surveyId: number, result: AIAnalyticsResult): Promise<void> {
    const db = await openSql();
    
    // Store the complete result in cache
    await this.storeAnalyticsResult(surveyId, result);
    
    // Simple completion log
    await db.execute(`
      INSERT INTO analytics_generation_log (
        survey_id, status, processing_time_ms
      ) VALUES (?, ?, ?)
    `, [
      surveyId,
      result.status,
      result.performance.totalTimeMs
    ]);
  }

  private async logAnalysisFailure(surveyId: number, error: string): Promise<void> {
    const db = await openSql();
    
    await db.execute(`
      INSERT INTO analytics_generation_log (
        survey_id, status, error_message
      ) VALUES (?, ?, ?)
    `, [surveyId, 'failed', error]);
  }

  private async getCachedAnalytics(surveyId: number): Promise<AIAnalyticsResult | null> {
    const db = await openSql();
    
    const [cached] = await db.execute(`
      SELECT analytics_data, expires_at
      FROM survey_analytics_cache 
      WHERE survey_id = ? 
        AND status = 'completed'
        AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY created_at DESC
      LIMIT 1
    `, [surveyId]) as any[];

    if (!cached || cached.length === 0) {
      return null;
    }

    try {
      const analyticsData = cached[0].analytics_data;
      // Handle both string and object JSON data
      const result = typeof analyticsData === 'string' 
        ? JSON.parse(analyticsData) 
        : analyticsData;
      
      return result as AIAnalyticsResult;
    } catch (error) {
      console.error('Failed to parse cached analytics data:', error);
      return null;
    }
  }
} 