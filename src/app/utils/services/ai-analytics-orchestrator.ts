// AI Analytics Orchestrator - Main service that coordinates the entire analytics pipeline
import { openSql } from '../database/db';
import { SurveyAnalysisEngine } from './survey-analysis-engine';
import { SurveyAnalysisConfig } from './survey-analysis-types';
import { StatisticalQueryGenerator, StatisticalAnalysisConfig } from './statistical-query-generator';
import { InsightGenerationService, InsightGenerationConfig } from './insight-generation-service';
import { VisualizationEngine, VisualizationConfig } from './visualization-engine';
import { SimpleStatsGenerator } from './simple-stats-generator';
import {
  buildAnalyticsContext,
  isContextInjectionEnabled,
  type AnalyticsContextBundle,
} from './analytics-context-service';
import type { ChartInsightNarrative, GeneratedInsights } from './insight-generation-service';

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

  /** Phase B: inject district/voter/prior-survey context into insights */
  enableContextInjection?: boolean;
  /** Organization / campaign id when known */
  campaignId?: number | null;
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
    // Defaults: claude-sonnet-4-6. Override any stage via config.*Model (A/B / rollback).
    this.analysisEngine = new SurveyAnalysisEngine(
      config.analysisModel || 'claude-sonnet-4-6'
    );
    this.queryGenerator = new StatisticalQueryGenerator(
      config.queryModel || 'claude-sonnet-4-6',
      config.queryCacheHours || 24
    );
    this.insightService = new InsightGenerationService(
      config.insightModel || 'claude-sonnet-4-6',
      config.insightsCacheHours || 48
    );
    this.visualizationEngine = new VisualizationEngine(
      config.visualizationModel || 'claude-sonnet-4-6',
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
          analysis: config.analysisModel || 'claude-sonnet-4-6',
          queries: config.queryModel || 'claude-sonnet-4-6',
          insights: config.insightModel || 'claude-sonnet-4-6',
          visualization: config.visualizationModel || 'claude-sonnet-4-6'
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

      // Phase B: assemble context bundle (never fails the run)
      const contextEnabled = isContextInjectionEnabled(config.enableContextInjection);
      let analyticsContext: AnalyticsContextBundle | null = null;
      if (contextEnabled) {
        try {
          analyticsContext = await buildAnalyticsContext(surveyId, config.campaignId);
          console.log(
            `Analytics context for survey ${surveyId}: included=[${analyticsContext.sourcesIncluded.join(',')}] missing=[${analyticsContext.sourcesMissing.join(',')}]`
          );
        } catch (ctxErr) {
          console.warn('buildAnalyticsContext failed (continuing without context):', ctxErr);
          analyticsContext = null;
        }
      }

      const successfulResults = result.queryResults.filter(r => r.success);
      const chartInsightTargets = contextEnabled
        ? successfulResults.slice(0, 6).map((qr, idx) => {
            const chartId = `chart_${qr.id || qr.queryId || idx}`;
            return {
              id: chartId,
              title: String(qr.title || qr.analysisType || `Analysis ${idx + 1}`),
              analysisType: String(qr.analysisType || 'distribution'),
              statsSummary: this.summarizeQueryStatsForPrompt(qr),
            };
          })
        : [];

      // Step 4: Generate Insights
      const insightStart = Date.now();
      console.log('Step 4: Generating business insights...');
      
      const insightConfig: InsightGenerationConfig = {
        insightModel: config.insightModel,
        forceRegenerate: config.forceRegenerate || config.forceRegenerateInsights,
        cacheExpirationHours: config.insightsCacheHours,
        enableContextInjection: contextEnabled,
        analyticsContext,
        chartInsightTargets,
      };
      
      let insightsFromModel = false;
      try {
        result.insights = await this.insightService.generateInsights(
          surveyId,
          successfulResults,
          result.analysis,
          insightConfig
        );
        insightsFromModel = true;
      } catch (insightError) {
        console.error('Insight model failed; using deterministic fallback insights:', insightError);
        result.insights = this.buildFallbackInsights(surveyId, successfulResults, analyticsContext);
        insightsFromModel = false;
      }
      result.metadata.cacheStatus.insights = insightConfig.forceRegenerate ? 'generated' : 'cached';
      result.performance.insightTimeMs = Date.now() - insightStart;
      
      console.log(`Insights generated in ${result.performance.insightTimeMs}ms`);

      // Step 5: Generate Visualizations & Dashboard (simplified approach)
      const vizStart = Date.now();
      console.log('Step 5: Creating dashboard directly from statistical data...');
      
      // Skip AI visualization - create charts directly from statistical results
      const successfulQueryResults = result.queryResults.filter(r => r.success);
      const modelChartInsights: ChartInsightNarrative[] = Array.isArray(result.insights?.chartInsights)
        ? result.insights.chartInsights
        : [];
      
      if (successfulQueryResults.length > 0) {
        // Create charts directly from statistical data without AI
        result.dashboard = this.createDirectDashboard(
          surveyId,
          successfulQueryResults,
          modelChartInsights,
          contextEnabled && insightsFromModel
        );
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

  private createDirectDashboard(
    surveyId: number,
    queryResults: any[],
    modelChartInsights: ChartInsightNarrative[] = [],
    preferModelInsights = false
  ): any {
    const charts: any[] = [];
    const byId = new Map(
      modelChartInsights
        .filter((c) => c && c.id)
        .map((c) => [String(c.id), c] as const)
    );

    for (const queryResult of queryResults) {
      if (queryResult.data && queryResult.data.length > 0) {
        const chart = this.createChartFromQueryResult(queryResult, byId, preferModelInsights);
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

  private createChartFromQueryResult(
    queryResult: any,
    modelInsightsById: Map<string, ChartInsightNarrative> = new Map(),
    preferModelInsights = false
  ): any | null {
    if (!queryResult.data || queryResult.data.length === 0) {
      return null;
    }

    const uniqueId = queryResult.id || `${queryResult.analysisType || 'unknown'}_${Math.random().toString(36).substr(2, 9)}`;
    const chartId = `chart_${uniqueId}`;
    const fallbackInsight = this.generateDataInsight(queryResult.data, queryResult.analysisType);
    const modelInsight = modelInsightsById.get(chartId);
    const insights =
      preferModelInsights && modelInsight
        ? {
            keyTakeaway: modelInsight.keyTakeaway || fallbackInsight.keyTakeaway,
            statisticalSignificance:
              typeof modelInsight.statisticalSignificance === 'boolean'
                ? modelInsight.statisticalSignificance
                : fallbackInsight.statisticalSignificance,
            businessRelevance: modelInsight.businessRelevance || fallbackInsight.businessRelevance,
            actionableInsight: modelInsight.actionableInsight || fallbackInsight.actionableInsight,
            source: 'model',
          }
        : { ...fallbackInsight, source: 'template' };

    if (queryResult.analysisType === 'cross_tab') {
      const heatmapData = queryResult.data.map((row: any) => ({
        x: row.demo_answer,
        y: row.opinion_answer,
        response_count: row.count,
      }));

      const [xLabelRaw, yLabelRaw] = (queryResult.title || '').split(' × ').map(p => p?.trim());
      return {
        id: chartId,
        type: 'heatmap',
        title: queryResult.title || 'Cross-tabulation',
        description: queryResult.description || 'Cross-tabulation between two questions',
        data: heatmapData,
        chartConfig: {
          xAxis: { key: 'x', label: xLabelRaw || 'XAxis', type: 'category' },
          yAxis: { key: 'y', label: yLabelRaw || 'YAxis', type: 'category' },
        },
        insights,
        priority: 5,
        category: 'correlation',
      };
    }

    const chartType = 'bar' as const;

    return {
      id: chartId,
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
      insights,
      priority: 5,
      category: 'opinion',
    };
  }

  /** Deterministic chart takeaways — fallback only when model insights unavailable. */
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

    const topCombo = [...data].sort((a, b) => (b.count || 0) - (a.count || 0))[0];
    return {
      keyTakeaway: `Most common combination: ${topCombo.demo_answer} × ${topCombo.opinion_answer} (${topCombo.count} responses)`,
      statisticalSignificance: totalResponses >= 30,
      businessRelevance: `${data.length} combinations from ${totalResponses} responses`,
      actionableInsight: 'Use heat-map to spot clusters',
    };
  }

  private summarizeQueryStatsForPrompt(qr: any): string {
    const data = Array.isArray(qr.data) ? qr.data : [];
    if (!data.length) return 'no rows';
    const total = data.reduce((sum: number, row: any) => sum + Number(row.count || 0), 0);
    const top = [...data].sort((a, b) => Number(b.count || 0) - Number(a.count || 0)).slice(0, 3);
    const topBits = top.map((row) => {
      if (row.answer_value != null) {
        return `${row.answer_value}=${row.count}${row.percentage != null ? ` (${row.percentage}%)` : ''}`;
      }
      return `${row.demo_answer}×${row.opinion_answer}=${row.count}`;
    });
    return `n=${total}; top: ${topBits.join('; ')}`;
  }

  private buildFallbackInsights(
    surveyId: number,
    successfulResults: any[],
    context: AnalyticsContextBundle | null
  ): GeneratedInsights {
    const first = successfulResults[0];
    const evidence = first ? this.summarizeQueryStatsForPrompt(first) : 'No successful statistical queries';
    const districtHint = context?.organization?.districtCode || context?.districtProfile?.districtCode;
    return {
      surveyId,
      executiveSummary: districtHint
        ? `Fallback summary for survey ${surveyId} (${districtHint}): model insight generation failed; numbers below are from computed stats only.`
        : `Fallback summary for survey ${surveyId}: model insight generation failed; numbers below are from computed stats only.`,
      keyFindings: [
        {
          title: 'Statistical snapshot (template fallback)',
          description: 'Automated fallback because the insight model call failed or returned invalid JSON.',
          statisticalEvidence: evidence,
          businessImplication: 'Re-run analytics with forceRegenerate once the model is healthy.',
          confidence: 'low',
          priority: 'notable',
        },
      ],
      demographicInsights: [],
      correlationInsights: [],
      recommendations: [
        {
          category: 'Data Quality',
          recommendation: 'Re-run AI insights when the provider is available',
          rationale: 'Template fallback preserves stats but loses campaign-specific narrative',
          priority: 'medium',
          timeframe: 'immediate',
        },
      ],
      dataQuality: {
        responseRate: 0,
        completeness: 0,
        reliability: 'Limited — insight model fallback',
        limitations: ['Insight model unavailable; chart takeaways use deterministic templates'],
      },
      nextSteps: ['Force-regenerate insights when Anthropic/OpenAI is reachable'],
      chartInsights: successfulResults.slice(0, 12).map((qr, idx) => {
        const id = `chart_${qr.id || qr.queryId || idx}`;
        const templated = this.generateDataInsight(qr.data || [], qr.analysisType || 'distribution');
        return {
          id,
          keyTakeaway: templated.keyTakeaway,
          businessRelevance: templated.businessRelevance,
          actionableInsight: templated.actionableInsight,
          statisticalSignificance: templated.statisticalSignificance,
        };
      }),
      contextSourcesIncluded: context?.sourcesIncluded || [],
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
