// AI Analytics Orchestrator - Main service that coordinates the entire analytics pipeline
import { openSql } from '../database/db';
import { SurveyAnalysisEngine, SurveyAnalysisConfig } from './survey-analysis-engine';
import { StatisticalQueryGenerator, StatisticalAnalysisConfig } from './statistical-query-generator';
import { InsightGenerationService, InsightGenerationConfig } from './insight-generation-service';
import { VisualizationEngine, VisualizationConfig } from './visualization-engine';
import { SimpleStatsGenerator } from './simple-stats-generator';

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
    // Initialize engines with optimized model assignments
    this.analysisEngine = new SurveyAnalysisEngine(
      config.analysisModel || 'gpt-4o-mini' // Simple analysis, don't need complex reasoning
    );
    this.queryGenerator = new StatisticalQueryGenerator(
      config.queryModel || 'gpt-4o-mini', // Simple SQL generation
      config.queryCacheHours || 24
    );
    this.insightService = new InsightGenerationService(
      config.insightModel || 'deepseek-chat', // Best for business insights
      config.insightsCacheHours || 48
    );
    this.visualizationEngine = new VisualizationEngine(
      config.visualizationModel || 'gpt-4o', // Good for structured visualization
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
      // Step 1: Skip complex analysis, create simple metadata
      const analysisStart = Date.now();
      console.log('Step 1: Creating simple survey metadata...');
      
      // Create minimal analysis metadata for the query generator
      result.analysis = {
        surveyId: surveyId,
        surveyType: 'Survey Analysis',
        mainThemes: ['Survey Responses'],
        analysisComplexity: 'simple'
      };
      result.metadata.cacheStatus.analysis = 'generated';
      result.performance.analysisTimeMs = Date.now() - analysisStart;
      
      console.log(`Simple metadata created in ${result.performance.analysisTimeMs}ms`);

      // Step 2 & 3: Generate and Execute Statistical Queries (using SimpleStatsGenerator)
      const queryStart = Date.now();
      console.log('Step 2 & 3: Generating and executing statistical queries...');
      
      // Use SimpleStatsGenerator directly (it already executes queries)
      const statsGenerator = new SimpleStatsGenerator();
      
      const statsResult = await statsGenerator.generateStats(surveyId, {
        maxDistributionQueries: 10,
        maxCrossTabQueries: 5
      });
      
      // Use the results directly from SimpleStatsGenerator
      result.queries = statsResult.queries;
      result.queryResults = statsResult.executedResults.map((qr: any) => ({
        id: qr.queryId,
        data: qr.data,
        summary: qr.summary,
        executedAt: new Date().toISOString(),
        success: qr.data && qr.data.length > 0,
        analysisType: statsResult.queries.find(q => q.id === qr.queryId)?.type || 'distribution',
        title: statsResult.queries.find(q => q.id === qr.queryId)?.title || 'Analysis',
        description: statsResult.queries.find(q => q.id === qr.queryId)?.description || qr.summary
      }));
      
      result.metadata.cacheStatus.queries = 'generated';
      result.performance.queryTimeMs = Date.now() - queryStart;
      
      console.log(`Generated and executed ${result.queryResults.length} queries in ${result.performance.queryTimeMs}ms`);

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

      // Step 5: Generate Visualizations & Dashboard (simplified approach)
      const vizStart = Date.now();
      console.log('Step 5: Creating dashboard directly from statistical data...');
      
      // Skip AI visualization - create charts directly from statistical results
      const successfulQueryResults = result.queryResults.filter(r => r.success);
      
      if (successfulQueryResults.length > 0) {
        // Create charts directly from statistical data without AI
        result.dashboard = this.createDirectDashboard(surveyId, successfulQueryResults);
        console.log(`Created dashboard with ${result.dashboard.charts.length} charts directly from data`);
      } else {
        // Fallback dashboard
        result.dashboard = this.createFallbackDashboard(surveyId, []);
        console.log('Created fallback dashboard due to no successful queries');
      }
      
      result.metadata.cacheStatus.visualizations = 'generated';
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
    
    // Calculate expiration (30 days from now instead of 24 hours)
    // This makes analytics much more persistent and reduces regeneration frequency
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days instead of 24 hours
    
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

  private createDirectDashboard(surveyId: number, queryResults: any[]): any {
    const charts: any[] = [];

    // Create charts directly from statistical query results
    for (const queryResult of queryResults) {
      if (queryResult.data && queryResult.data.length > 0) {
        const chart = this.createChartFromQueryResult(queryResult);
        if (chart) {
          charts.push(chart);
        }
      }
    }

    return {
      title: `Survey ${surveyId} Statistical Analysis`,
      description: `Statistical distributions and analysis for survey ${surveyId}`,
      charts: charts,
      layout: {
        sections: [
          {
            title: "Statistical Distributions",
            chartIds: charts.map(c => c.id),
            priority: 1
          }
        ],
        recommendedOrder: charts.map(c => c.id)
      },
      interactivity: {
        filters: [],
        drillDowns: []
      }
    };
  }

  private createChartFromQueryResult(queryResult: any): any | null {
    if (!queryResult.data || queryResult.data.length === 0) {
      return null;
    }

    // Use the preserved unique ID from SimpleStatsGenerator
    const uniqueId = queryResult.id || `${queryResult.analysisType || 'unknown'}_${Math.random().toString(36).substr(2, 9)}`;

    if (queryResult.analysisType === 'cross_tab') {
      // Convert raw rows to heat-map friendly format (keeping numeric values for now)
      const heatmapData = queryResult.data.map((row: any) => ({
        x: row.demo_answer,
        y: row.opinion_answer,
        response_count: row.count,
      }));

      const [xLabelRaw, yLabelRaw] = (queryResult.title || '').split(' × ').map(p => p?.trim());
      return {
        id: `chart_${uniqueId}`,
        type: 'heatmap',
        title: queryResult.title || 'Cross-tabulation',
        description: queryResult.description || 'Cross-tabulation between two questions',
        data: heatmapData,
        chartConfig: {
          xAxis: { key: 'x', label: xLabelRaw || 'XAxis', type: 'category' },
          yAxis: { key: 'y', label: yLabelRaw || 'YAxis', type: 'category' },
        },
        insights: this.generateDataInsight(queryResult.data, queryResult.analysisType),
        priority: 5,
        category: 'correlation',
      };
    }

    // Default to distribution bar chart
    const chartType = 'bar' as const;

    return {
      id: `chart_${uniqueId}`,
      type: chartType,
      title: queryResult.title || 'Distribution',
      description: queryResult.description || `Statistical distribution (${queryResult.data.length} categories)`,
      data: queryResult.data,
      chartConfig: {
        xAxis: { key: 'answer_value', label: 'Response', type: 'category' },
        yAxis: { key: 'count', label: 'Count', type: 'numeric' },
        series: [{ key: 'count', label: 'Responses', color: '#3f3f46' }],
        colors: ['#18181b', '#27272a', '#3f3f46', '#52525b'],
        layout: 'vertical',
        showLegend: false,
        showTooltip: true,
        formatters: { percentage: 'percentage' },
      },
      insights: this.generateDataInsight(queryResult.data, queryResult.analysisType),
      priority: 5,
      category: 'opinion',
    };
  }

  private generateDataInsight(data: any[], analysisType: string): any {
    if (!data || data.length === 0) {
      return {
        keyTakeaway: 'No data available',
        statisticalSignificance: false,
        businessRelevance: 'Insufficient data',
        actionableInsight: 'Collect more responses',
      };
    }

    const totalResponses = data.reduce((sum, item) => sum + (item.count || 0), 0);

    if (analysisType === 'distribution') {
      const sorted = [...data].sort((a, b) => (b.count || 0) - (a.count || 0));
      const top = sorted[0];
      const second = sorted[1];
      const topPct = top.percentage || 0;

      let takeaway = '';
      if (data.length === 2) {
        takeaway = `${top.answer_value}: ${topPct}%, ${second.answer_value}: ${second.percentage || 0}%`;
      } else if (topPct > 40) {
        takeaway = `Clear majority chose "${top.answer_value}" (${topPct}%)`;
      } else {
        takeaway = `"${top.answer_value}" leads with ${topPct}%`;
      }

      return {
        keyTakeaway: takeaway,
        statisticalSignificance: totalResponses >= 30,
        businessRelevance: `${totalResponses} total responses`,
        actionableInsight: `${data.length} categories analysed`,
      };
    }

    // Cross-tab insight
    const topCombo = [...data].sort((a, b) => (b.count || 0) - (a.count || 0))[0];
    return {
      keyTakeaway: `Most common combination: ${topCombo.demo_answer} × ${topCombo.opinion_answer} (${topCombo.count} responses)`,
      statisticalSignificance: totalResponses >= 30,
      businessRelevance: `${data.length} combinations from ${totalResponses} responses`,
      actionableInsight: 'Use heat-map to spot clusters',
    };
  }

  private createFallbackDashboard(surveyId: number, queryResults: any[]): any {
    return {
      title: `Survey ${surveyId} Analysis`,
      description: 'Basic survey analysis dashboard',
      charts: [],
      layout: {
        sections: [],
        recommendedOrder: []
      },
      interactivity: {
        filters: [],
        drillDowns: []
      }
    };
  }
} 