// Visualization Engine - Creates intelligent charts and dashboard layouts from statistical data
import { StatisticalQueryResult } from './statistical-query-generator';
import { openSql } from '../database/db';
import { RowDataPacket } from 'mysql2';
import { createCompletion } from './ai-service';
import JSON5 from 'json5';
import { jsonrepair } from 'jsonrepair';

export interface VisualizationConfig {
  visualizationModel?: string;
  forceRegenerate?: boolean;
  cacheExpirationHours?: number;
  maxCharts?: number;
}

export interface ChartConfiguration {
  id: string;
  type: 'bar' | 'pie' | 'line' | 'scatter' | 'heatmap' | 'table' | 'histogram';
  title: string;
  description: string;
  data: any[];
  chartConfig: {
    xAxis?: { key: string; label: string; type: 'category' | 'numeric' | 'datetime' };
    yAxis?: { key: string; label: string; type: 'numeric' | 'category' };
    series?: Array<{ key: string; label: string; color?: string }>;
    colors?: string[];
    layout?: 'horizontal' | 'vertical';
    showLegend?: boolean;
    showTooltip?: boolean;
    formatters?: { [key: string]: string };
  };
  insights: {
    keyTakeaway: string;
    statisticalSignificance: boolean;
    businessRelevance: string;
    actionableInsight: string;
  };
  priority: number; // 1-10, higher = more important
  category: 'demographic' | 'opinion' | 'behavioral' | 'correlation' | 'trend';
}

export interface DashboardLayout {
  title: string;
  description: string;
  charts: ChartConfiguration[];
  layout: {
    sections: Array<{
      title: string;
      chartIds: string[];
      priority: number;
    }>;
    recommendedOrder: string[];
  };
  interactivity: {
    filters: Array<{ key: string; label: string; type: string; options?: any[] }>;
    drillDowns: Array<{ fromChart: string; toChart: string; trigger: string }>;
  };
}

export class VisualizationEngine {
  private defaultModel: string;
  private defaultCacheHours: number = 720; // 30 days instead of 24 hours

  constructor(
    defaultModel: string = 'gpt-4o', // Good balance for visualization logic
    defaultCacheHours: number = 720
  ) {
    this.defaultModel = defaultModel;
    this.defaultCacheHours = defaultCacheHours;
  }

  async generateDashboard(
    surveyId: number,
    statisticalResults: any[],
    insights: any,
    analysisMetadata: any,
    config: VisualizationConfig = {}
  ): Promise<DashboardLayout> {
    const model = config.visualizationModel || this.defaultModel;
    const cacheHours = config.cacheExpirationHours || this.defaultCacheHours;
    const maxCharts = config.maxCharts || 12;

    // Check for cached dashboard unless force regenerate
    if (!config.forceRegenerate) {
      const cached = await this.getCachedDashboard(surveyId, cacheHours);
      if (cached) {
        console.log(`Using cached dashboard for survey ${surveyId}`);
        return cached;
      }
    }

    // Generate dashboard using AI
    const dashboard = await this.generateDashboardWithAI(
      surveyId,
      statisticalResults,
      insights,
      analysisMetadata,
      model,
      maxCharts
    );

    // Cache the dashboard
    await this.cacheDashboard(surveyId, dashboard);

    return dashboard;
  }

  private async generateDashboardWithAI(
    surveyId: number,
    statisticalResults: any[],
    insights: any,
    analysisMetadata: any,
    model: string,
    maxCharts: number
  ): Promise<DashboardLayout> {
    const systemPrompt = `You are a data visualization expert specializing in survey analytics dashboards. Your role is to create compelling, insightful visualizations that tell the story of the data.

You excel at:
- Selecting the most appropriate chart types for different data types
- Creating clear, actionable visualizations
- Designing intuitive dashboard layouts
- Highlighting key insights through visual design
- Ensuring accessibility and usability

CRITICAL: Return ONLY valid JSON with no additional text, explanations, or markdown formatting.`;

    const userPrompt = `Create a comprehensive dashboard for this survey analysis:

**Survey Context:**
- Survey ID: ${surveyId}
- Survey Type: ${analysisMetadata.surveyType}
- Main Themes: ${analysisMetadata.mainThemes?.join(', ')}
- Total Charts Limit: ${maxCharts}

**Statistical Results:**
${this.formatResultsForVisualization(statisticalResults)}

**Key Insights:**
${this.formatInsightsForVisualization(insights)}

**Requirements:**
Create a dashboard with ${maxCharts} or fewer charts that effectively communicate the survey findings.

Return this exact JSON structure:
{
  "title": "Dashboard title based on survey type and key findings",
  "description": "Brief description of what this dashboard shows",
  "charts": [
    {
      "id": "unique_chart_id",
      "type": "bar|pie|line|scatter|heatmap|table|histogram",
      "title": "Clear, descriptive chart title",
      "description": "What this chart shows and why it matters",
      "data": [array_of_data_objects_with_consistent_structure],
      "chartConfig": {
        "xAxis": {"key": "column_name", "label": "Display Label", "type": "category|numeric|datetime"},
        "yAxis": {"key": "column_name", "label": "Display Label", "type": "numeric|category"},
        "series": [{"key": "column_name", "label": "Series Name", "color": "#hex_color"}],
        "colors": ["#hex1", "#hex2", "#hex3"],
        "layout": "horizontal|vertical",
        "showLegend": true,
        "showTooltip": true,
        "formatters": {"column_name": "percentage|currency|number|date"}
      },
      "insights": {
        "keyTakeaway": "Main insight from this chart",
        "statisticalSignificance": true_or_false,
        "businessRelevance": "Why this matters for business decisions",
        "actionableInsight": "What action should be taken based on this"
      },
      "priority": number_1_to_10,
      "category": "demographic|opinion|behavioral|correlation|trend"
    }
  ],
  "layout": {
    "sections": [
      {
        "title": "Section name (e.g., 'Key Metrics', 'Demographics')",
        "chartIds": ["chart_id_1", "chart_id_2"],
        "priority": number_1_to_10
      }
    ],
    "recommendedOrder": ["chart_id_1", "chart_id_2", "etc"]
  },
  "interactivity": {
    "filters": [
      {"key": "column_name", "label": "Filter Label", "type": "select|range|date", "options": ["option1", "option2"]}
    ],
    "drillDowns": [
      {"fromChart": "chart_id", "toChart": "detail_chart_id", "trigger": "click|hover"}
    ]
  }
}

**Chart Selection Guidelines:**
- Bar charts: Comparisons, distributions, rankings
- Pie charts: Parts of a whole (max 6 segments)
- Line charts: Trends over time or ordered categories
- Scatter plots: Correlations between two variables
- Heatmaps: Cross-tabulations, correlation matrices
- Tables: Detailed breakdowns, multiple metrics
- Histograms: Distribution of continuous variables

**Data Format:**
Ensure all chart data arrays have consistent object structures within each chart.
Use actual data from the statistical results, not placeholder data.

**Color Scheme:**
Use a professional, accessible color palette with sufficient contrast.
Stick to zinc/neutral theme: #18181b, #27272a, #3f3f46, #52525b, #71717a, #a1a1aa`;

    console.log(`Generating dashboard for survey ${surveyId} with model: ${model}`);
    
    const response = await createCompletion({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3, // Lower temperature for consistent structure
      maxTokens: 12000
    });

    let dashboard: DashboardLayout;
    try {
      // Remove markdown code blocks
      let cleanedContent = response.content;
      
      // Remove markdown code blocks
      cleanedContent = cleanedContent.replace(/```json\s*/g, '');
      cleanedContent = cleanedContent.replace(/```\s*$/g, '');
      cleanedContent = cleanedContent.trim();
      
      // Remove leading/trailing comments and fix common issues
      cleanedContent = cleanedContent.replace(/^[\s\S]*?{\s*/m, '{'); // ensure starts with {
      cleanedContent = cleanedContent.replace(/\s*```$/, '');
      
      // Remove non-printable / combining characters (e.g. strikethrough marks)
      cleanedContent = cleanedContent.replace(/[\u0000-\u001F\u007F-\u009F\u0300-\u036F]/g, '');
      
      try {
        // Prefer JSON5 for robust parsing (handles comments, trailing commas, single quotes)
        dashboard = JSON5.parse(cleanedContent);
      } catch(json5Err) {
        // Try automatic repair first
        try {
          dashboard = JSON.parse(jsonrepair(cleanedContent));
        } catch(repairErr) {
          // Legacy cleaning + JSON.parse as last resort
          cleanedContent = cleanedContent.replace(/(\w+)":/g, '"$1":');
          cleanedContent = cleanedContent.replace(/:\s*([A-Za-z][A-Za-z0-9_\s]+)(?=,|\})/g, ': "$1"');
          cleanedContent = cleanedContent.replace(/'/g, '"');
          cleanedContent = cleanedContent.replace(/\/\/.*$/gm, '');
          cleanedContent = cleanedContent.replace(/,\s*([}\]])/g, '$1');
          cleanedContent = cleanedContent.replace(/0drillDowns"/g, '"drillDowns"');
          dashboard = JSON.parse(cleanedContent);
        }
      }
    } catch (error) {
      console.error('Failed to parse AI dashboard response:', response.content);
      console.error('Parse error:', error);
      
      // Try to extract just the valid JSON portion
      try {
        const jsonMatch = response.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          let partialJson = jsonMatch[0];
          // Attempt repair on extracted JSON fragment
          try {
            dashboard = JSON.parse(jsonrepair(partialJson));
            return dashboard;
          } catch {}

          partialJson = partialJson.replace(/(\w+)":/g, '"$1":');
          partialJson = partialJson.replace(/:\s*([A-Za-z][A-Za-z0-9\s]+)(?=,|\})/g, ': "$1"');
          partialJson = partialJson.replace(/0drillDowns"/g, '"drillDowns"');
          dashboard = JSON.parse(partialJson);
        } else {
          throw new Error('No valid JSON found');
        }
      } catch (fallbackError) {
        console.error('Fallback JSON parsing also failed. Using fallback dashboard.');
        dashboard = this.createFallbackDashboard(surveyId, statisticalResults);
      }
    }

    // Validate dashboard structure
    if (!dashboard.title || !dashboard.charts || !Array.isArray(dashboard.charts)) {
      throw new Error('AI dashboard missing required fields');
    }

    // Ensure chart limit
    if (dashboard.charts.length > maxCharts) {
      dashboard.charts = dashboard.charts
        .sort((a, b) => b.priority - a.priority)
        .slice(0, maxCharts);
    }

    return dashboard;
  }

  private formatResultsForVisualization(results: any[]): string {
    let formatted = '';
    
    results.forEach((result, index) => {
      formatted += `\n**Dataset ${index + 1}: ${result.analysisType}**\n`;
      formatted += `Description: ${result.metadata?.analysisDescription || 'Statistical analysis'}\n`;
      
      if (result.data && Array.isArray(result.data) && result.data.length > 0) {
        formatted += `Data Structure: ${Object.keys(result.data[0]).join(', ')}\n`;
        formatted += `Sample Size: ${result.data.length} rows\n`;
        
        // Show data sample
        const sample = result.data.slice(0, 3);
        formatted += `Sample Data:\n`;
        sample.forEach((row: any, i: number) => {
          formatted += `  ${JSON.stringify(row)}\n`;
        });
        
        // Show data statistics if available
        if (result.statistics) {
          formatted += `Statistics: ${JSON.stringify(result.statistics)}\n`;
        }
      }
      
      formatted += '\n';
    });
    
    return formatted;
  }

  private formatInsightsForVisualization(insights: any): string {
    if (!insights) return 'No insights provided';
    
    let formatted = `**Executive Summary:** ${insights.executiveSummary}\n\n`;
    
    if (insights.keyFindings && insights.keyFindings.length > 0) {
      formatted += `**Key Findings:**\n`;
      insights.keyFindings.forEach((finding: any, i: number) => {
        formatted += `${i + 1}. ${finding.title}: ${finding.description}\n`;
      });
      formatted += '\n';
    }
    
    if (insights.recommendations && insights.recommendations.length > 0) {
      formatted += `**Top Recommendations:**\n`;
      insights.recommendations.slice(0, 3).forEach((rec: any, i: number) => {
        formatted += `${i + 1}. ${rec.recommendation} (${rec.priority} priority)\n`;
      });
    }
    
    return formatted;
  }

  private async getCachedDashboard(surveyId: number, cacheHours: number): Promise<DashboardLayout | null> {
    const db = await openSql();
    
    // Check for cached dashboard in the new simplified table
    const [cached] = await db.execute(`
      SELECT analytics_data 
      FROM survey_analytics_cache 
      WHERE survey_id = ? 
        AND status = 'completed'
        AND JSON_EXTRACT(analytics_data, '$.dashboard') IS NOT NULL
        AND created_at > DATE_SUB(NOW(), INTERVAL ? HOUR)
      ORDER BY created_at DESC
      LIMIT 1
    `, [surveyId, cacheHours]) as any[];

    if (!cached || cached.length === 0) {
      return null;
    }

    try {
      const analyticsData = cached[0].analytics_data;
      const fullResult = typeof analyticsData === 'string' ? JSON.parse(analyticsData) : analyticsData;
      
      // Extract the dashboard portion
      return fullResult.dashboard || null;
    } catch (error) {
      console.error('Error parsing cached dashboard:', error);
      return null;
    }
  }

  private async cacheDashboard(surveyId: number, dashboard: DashboardLayout): Promise<void> {
    // Dashboard will be stored as part of the complete result by the orchestrator
    // This method is now a no-op since we use centralized storage
    console.log(`Cached dashboard for survey ${surveyId} with ${dashboard.charts.length} charts`);
  }

  private createFallbackDashboard(surveyId: number, statisticalResults: any[]): DashboardLayout {
    // Create a simple fallback dashboard
    const charts: ChartConfiguration[] = [];
    
    // Add a basic chart for total responses
    charts.push({
      id: 'fallback_total_responses',
      type: 'bar',
      title: 'Total Survey Responses',
      description: 'Overview of survey participation',
      data: [
        { category: 'Total Responses', value: statisticalResults.length > 0 ? statisticalResults[0].data?.length || 0 : 0, percentage: 100 }
      ],
      chartConfig: {
        xAxis: { key: 'category', label: 'Metric', type: 'category' },
        yAxis: { key: 'value', label: 'Count', type: 'numeric' },
        colors: ['#3b82f6'],
        layout: 'horizontal',
        showLegend: false,
        showTooltip: true,
        formatters: { percentage: 'percentage' }
      },
      insights: {
        keyTakeaway: 'Survey completion data available',
        statisticalSignificance: false,
        businessRelevance: 'Basic participation metrics',
        actionableInsight: 'Review response patterns for insights'
      },
      priority: 5,
      category: 'demographic'
    });

    return {
      title: 'Survey Analytics Dashboard',
      description: 'Basic analytics overview for survey responses',
      charts,
      layout: {
        sections: [{
          title: 'Overview',
          chartIds: charts.map(c => c.id),
          priority: 5
        }],
        recommendedOrder: charts.map(c => c.id)
      },
      interactivity: {
        filters: [],
        drillDowns: []
      }
    };
  }

  /**
   * Generate chart configurations from statistical results
   */
  static async generateChartsFromResults(
    surveyId: number,
    statisticalResults: StatisticalQueryResult[]
  ): Promise<ChartConfiguration[]> {
    
    const charts: ChartConfiguration[] = [];
    
    for (const result of statisticalResults) {
      const chart = this.createChartFromResult(result);
      if (chart) {
        charts.push(chart);
      }
    }
    
    // Sort by priority and store in database
    charts.sort((a, b) => b.priority - a.priority);
    await this.storeVisualizationConfigs(surveyId, charts);
    
    return charts;
  }

  /**
   * Create a chart configuration from a statistical result
   */
  private static createChartFromResult(result: StatisticalQueryResult): ChartConfiguration | null {
    
    if (!result.metadata || !result.metadata.questionIds) return null;
    
    const baseChart = {
      id: `chart_${result.analysisType}`,
      title: result.metadata.analysisDescription || 'Survey Analysis',
      description: result.metadata.businessRelevance || '',
      insights: {
        keyTakeaway: result.metadata.analysisDescription || '',
        statisticalSignificance: result.metadata.statisticalSignificance || false,
        businessRelevance: result.metadata.businessRelevance || '',
        actionableInsight: result.metadata.businessRelevance || ''
      },
      priority: this.calculateChartPriority(result),
      category: this.getCategoryFromAnalysisType(result.analysisType)
    };
    
    // Default to bar chart for now
    return this.createBarChart(result, baseChart);
  }

  private static getCategoryFromAnalysisType(analysisType: string): 'demographic' | 'opinion' | 'behavioral' | 'correlation' | 'trend' {
    switch (analysisType) {
      case 'cross_tabulation': return 'demographic';
      case 'correlation': return 'correlation';
      case 'segmentation': return 'demographic';
      case 'distribution': return 'opinion';
      default: return 'opinion';
    }
  }

  /**
   * Create bar chart configuration
   */
  private static createBarChart(result: StatisticalQueryResult, base: any): ChartConfiguration {
    // Simple fallback data structure
    const data = [
      { category: 'Sample Data', value: 100, percentage: 50 }
    ];
    
    return {
      ...base,
      type: 'bar',
      data,
      chartConfig: {
        xAxis: {
          key: 'category',
          label: 'Response',
          type: 'category'
        },
        yAxis: {
          key: 'value',
          label: 'Count',
          type: 'numeric'
        },
        colors: ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444'],
        layout: 'horizontal',
        showLegend: false,
        showTooltip: true,
        formatters: {
          percentage: 'percentage'
        }
      }
    };
  }

  /**
   * Calculate chart priority based on statistical significance and sample size
   */
  private static calculateChartPriority(result: StatisticalQueryResult): number {
    let priority = 5; // Base priority
    
    // Boost priority for statistically significant results
    if (result.metadata.statisticalSignificance) priority += 3;
    
    // Boost priority for large sample sizes
    if (result.metadata.minimumSampleSize >= 1000) priority += 2;
    else if (result.metadata.minimumSampleSize >= 500) priority += 1;
    
    return Math.min(priority, 10); // Cap at 10
  }

  /**
   * Store visualization configurations in database
   */
  private static async storeVisualizationConfigs(
    surveyId: number,
    charts: ChartConfiguration[]
  ): Promise<void> {
    const db = await openSql();
    
    try {
      // Clear existing visualizations
      await db.execute('DELETE FROM visualization_configs WHERE survey_id = ?', [surveyId]);
      
      // Insert new visualizations
      for (let i = 0; i < charts.length; i++) {
        const chart = charts[i];
        
        await db.execute(
          `INSERT INTO visualization_configs 
           (survey_id, chart_type, chart_title, chart_config, data_cache, position_order)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            surveyId,
            chart.type,
            chart.title,
            JSON.stringify({
              description: chart.description,
              chartConfig: chart.chartConfig,
              insights: chart.insights,
              priority: chart.priority
            }),
            JSON.stringify(chart.data),
            i + 1
          ]
        );
      }
      
      console.log(`Stored ${charts.length} visualization configurations for survey ${surveyId}`);
      
    } catch (error) {
      console.error('Error storing visualization configs:', error);
      throw error;
    }
  }

  /**
   * Get stored visualization configurations
   */
  static async getStoredVisualizations(surveyId: number): Promise<ChartConfiguration[]> {
    const db = await openSql();
    
    try {
      const [rows] = await db.execute<RowDataPacket[]>(
        `SELECT * FROM visualization_configs 
         WHERE survey_id = ? AND is_active = 1 
         ORDER BY position_order ASC`,
        [surveyId]
      );
      
      return rows.map(row => {
        const config = JSON.parse(row.chart_config || '{}');
        const data = JSON.parse(row.data_cache || '[]');
        
        return {
          id: `stored_${row.id}`,
          type: row.chart_type,
          title: row.chart_title,
          description: config.description || '',
          data,
          chartConfig: config.chartConfig || {},
          insights: config.insights || {
            keyTakeaway: '',
            statisticalSignificance: false,
            businessRelevance: '',
            actionableInsight: ''
          },
          priority: config.priority || 5,
          category: 'opinion' as const
        };
      });
      
    } catch (error) {
      console.error('Error retrieving stored visualizations:', error);
      return [];
    }
  }

  /**
   * Generate dashboard layout recommendations
   */
  static generateDashboardLayout(charts: ChartConfiguration[]): any {
    const layout = {
      sections: [
        {
          title: 'Key Insights',
          charts: charts.filter(c => c.priority >= 8).slice(0, 2),
          columns: 2
        },
        {
          title: 'Response Distributions',
          charts: charts.filter(c => c.type === 'bar' || c.type === 'pie').slice(0, 4),
          columns: 2
        },
        {
          title: 'Demographic Analysis',
          charts: charts.filter(c => c.type === 'heatmap').slice(0, 2),
          columns: 1
        },
        {
          title: 'Correlations & Patterns',
          charts: charts.filter(c => c.type === 'scatter').slice(0, 2),
          columns: 2
        }
      ]
    };
    
    return layout;
  }

  /**
   * Export chart data for external tools
   */
  static exportChartsData(charts: ChartConfiguration[], format: 'json' | 'csv' = 'json'): any {
    if (format === 'json') {
      return {
        exported_at: new Date().toISOString(),
        charts: charts.map(chart => ({
          id: chart.id,
          title: chart.title,
          type: chart.type,
          data: chart.data,
          insights: chart.insights
        }))
      };
    }
    
    // CSV export would require more complex formatting
    return charts;
  }
} 