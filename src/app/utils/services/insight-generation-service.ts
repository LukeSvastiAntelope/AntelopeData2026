// Insight Generation Service - Converts statistical results into meaningful insights using LLM
import OpenAI from 'openai';
import { openSql as getMySQLConnection } from '../database/db';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { SurveyAnalysisResult } from './survey-analysis-types';
import { StatisticalQueryResult } from './statistical-query-generator';
import { createCompletion } from './ai-service';
import {
  formatAnalyticsContextForPrompt,
  type AnalyticsContextBundle,
} from './analytics-context-service';

// NOTE: This file routes LLM calls through `createCompletion()` which lazily
// initializes provider clients. Do not instantiate OpenAI at module-load time
// because it makes `next build` fail when keys are not present.

export interface InsightGenerationConfig {
  insightModel?: string;
  forceRegenerate?: boolean;
  cacheExpirationHours?: number;
  /** Phase B: inject campaign/district/voter context into the insight prompt */
  enableContextInjection?: boolean;
  analyticsContext?: AnalyticsContextBundle | null;
  /** Query/chart ids for which to request model-written takeaways (Phase B de-template) */
  chartInsightTargets?: Array<{
    id: string;
    title: string;
    analysisType: string;
    statsSummary: string;
  }>;
}

export interface ChartInsightNarrative {
  id: string;
  keyTakeaway: string;
  businessRelevance: string;
  actionableInsight: string;
  statisticalSignificance?: boolean;
}

export interface GeneratedInsights {
  surveyId: number;
  executiveSummary: string;
  keyFindings: Array<{
    title: string;
    description: string;
    statisticalEvidence: string;
    businessImplication: string;
    confidence: 'high' | 'medium' | 'low';
    priority: 'critical' | 'important' | 'notable';
  }>;
  demographicInsights: Array<{
    segment: string;
    finding: string;
    comparison: string;
    actionable: string;
  }>;
  correlationInsights: Array<{
    variables: string[];
    relationship: string;
    strength: 'strong' | 'moderate' | 'weak';
    interpretation: string;
    businessRelevance: string;
  }>;
  recommendations: Array<{
    category: string;
    recommendation: string;
    rationale: string;
    priority: 'high' | 'medium' | 'low';
    timeframe: 'immediate' | 'short-term' | 'long-term';
  }>;
  dataQuality: {
    responseRate: number;
    completeness: number;
    reliability: string;
    limitations: string[];
  };
  nextSteps: string[];
  /** Phase B: model-generated per-chart narratives (optional) */
  chartInsights?: ChartInsightNarrative[];
  contextSourcesIncluded?: string[];
}

export class InsightGenerationService {
  private defaultModel: string;
  private defaultCacheHours: number;

  constructor(
    defaultModel: string = 'claude-sonnet-4-6',
    defaultCacheHours: number = 48
  ) {
    this.defaultModel = defaultModel;
    this.defaultCacheHours = defaultCacheHours;
  }

  async generateInsights(
    surveyId: number,
    statisticalResults: any[],
    analysisMetadata: any,
    config: InsightGenerationConfig = {}
  ): Promise<GeneratedInsights> {
    const model = config.insightModel || this.defaultModel;
    const cacheHours = config.cacheExpirationHours || this.defaultCacheHours;

    // Check for cached insights unless force regenerate
    if (!config.forceRegenerate) {
      const cached = await this.getCachedInsights(surveyId, cacheHours);
      if (cached) {
        console.log(`Using cached insights for survey ${surveyId}`);
        return cached;
      }
    }

    // Generate insights using AI
    const insights = await this.generateInsightsWithAI(
      surveyId,
      statisticalResults,
      analysisMetadata,
      model,
      config
    );

    // Cache the insights
    await this.cacheInsights(surveyId, insights);

    return insights;
  }

  private async generateInsightsWithAI(
    surveyId: number,
    statisticalResults: any[],
    analysisMetadata: any,
    model: string,
    config: InsightGenerationConfig = {}
  ): Promise<GeneratedInsights> {
    const useContext = Boolean(config.enableContextInjection && config.analyticsContext);
    const contextBlock = useContext
      ? formatAnalyticsContextForPrompt(config.analyticsContext!)
      : '';

    const systemPrompt = `You are a senior political data analyst for hyperlocal and downballot campaigns. Transform statistical survey results into actionable campaign insights.

You excel at:
- Grounding narrative in computed statistics (never invent numbers)
- Using campaign/district/voter-file context to make insights specific to this race
- Saying when context is missing rather than inventing district facts
- Prioritizing findings by campaign impact

CRITICAL:
- Treat STATISTICAL RESULTS as ground truth for all numbers, percentages, and counts.
- Treat CONTEXT BUNDLE as background only — use it to localize insights; if a source is missing, omit it.
- Return ONLY valid JSON with no markdown fences or commentary.`;

    const chartTargets = config.chartInsightTargets || [];
    const chartSection =
      useContext && chartTargets.length
        ? `

Also generate chartInsights for each target below. Numbers in keyTakeaway MUST match the provided statsSummary exactly (do not invent counts).
${chartTargets
  .map(
    (t) =>
      `- id: ${t.id}\n  title: ${t.title}\n  type: ${t.analysisType}\n  statsSummary: ${t.statsSummary}`
  )
  .join('\n')}`
        : '';

    const userPrompt = `Analyze these survey results and generate comprehensive campaign insights.

=== (A) STATISTICAL QUERY RESULTS (GROUND TRUTH) ===
${this.formatResultsForPrompt(statisticalResults)}

=== (B) RAW CONTEXT BUNDLE ${useContext ? '(use to localize; omit missing sources)' : '(not enabled this run)'} ===
${useContext ? contextBlock : 'Context injection disabled — rely on stats and survey metadata only.'}

**Survey metadata:**
- Survey ID: ${surveyId}
- Survey Type: ${analysisMetadata.surveyType}
- Main Themes: ${analysisMetadata.mainThemes?.join(', ')}
- Analysis Complexity: ${analysisMetadata.analysisComplexity}

${JSON.stringify(analysisMetadata, null, 2)}
${chartSection}

Generate insights in this exact JSON structure:
{
  "surveyId": ${surveyId},
  "executiveSummary": "2-3 sentence high-level summary grounded in stats${useContext ? ' and district/campaign context when present' : ''}",
  "keyFindings": [
    {
      "title": "Clear, actionable finding title",
      "description": "Detailed explanation of the finding",
      "statisticalEvidence": "Supporting data and statistics copied from ground truth",
      "businessImplication": "What this means for the campaign",
      "confidence": "high|medium|low",
      "priority": "critical|important|notable"
    }
  ],
  "demographicInsights": [
    {
      "segment": "Demographic group",
      "finding": "Key insight about this segment",
      "comparison": "How this segment differs from others",
      "actionable": "Specific action recommendations"
    }
  ],
  "correlationInsights": [
    {
      "variables": ["Variable 1", "Variable 2"],
      "relationship": "Description of the relationship",
      "strength": "strong|moderate|weak",
      "interpretation": "What this relationship means",
      "businessRelevance": "Why this matters for campaign decisions"
    }
  ],
  "recommendations": [
    {
      "category": "Area of focus",
      "recommendation": "Specific action to take",
      "rationale": "Why this recommendation is important",
      "priority": "high|medium|low",
      "timeframe": "immediate|short-term|long-term"
    }
  ],
  "dataQuality": {
    "responseRate": percentage_as_number,
    "completeness": percentage_as_number,
    "reliability": "assessment of data reliability",
    "limitations": ["list", "of", "data", "limitations"]
  },
  "nextSteps": ["array", "of", "recommended", "next", "steps"],
  "chartInsights": [
    {
      "id": "chart id from targets",
      "keyTakeaway": "Narrative takeaway with exact numbers from statsSummary",
      "businessRelevance": "Why this chart matters for this district/campaign",
      "actionableInsight": "Concrete next step",
      "statisticalSignificance": true
    }
  ]
}

**Guidelines:**
- Prefer campaign language over generic business jargon when context is political
- When district or voter-file context exists, reference it specifically
- When prior surveys exist, note continuity or contrast if stats support it
- Never invent poll numbers, district PVI, or list sizes not present in (A) or (B)
- Identify 3-7 key findings, 2-5 demographic insights, and 3-8 recommendations
- If chartInsights targets were provided, include one entry per target id`;

    console.log(
      `Generating insights for survey ${surveyId} with model: ${model} (contextInjection=${useContext})`
    );

    const response = await createCompletion({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.4,
      // Context + chartInsights need more headroom than the legacy path
      maxTokens: useContext ? 16000 : 8000,
    });

    let insights: GeneratedInsights;
    try {
      let cleanedContent = response.content;
      cleanedContent = cleanedContent.replace(/```json\s*/gi, '').replace(/```/g, '');
      cleanedContent = cleanedContent.trim();
      const jsonMatch = cleanedContent.match(/\{[\s\S]*\}/);
      const candidate = jsonMatch ? jsonMatch[0] : cleanedContent;
      insights = JSON.parse(candidate);
    } catch (error) {
      console.error('Failed to parse AI insights response:', response.content?.slice?.(0, 2000) || response.content);
      throw new Error('AI returned invalid JSON response for insights');
    }

    if (!insights.executiveSummary || !insights.keyFindings || !Array.isArray(insights.keyFindings)) {
      throw new Error('AI insights missing required fields');
    }

    if (useContext && config.analyticsContext) {
      insights.contextSourcesIncluded = config.analyticsContext.sourcesIncluded;
    }

    return insights;
  }

  private formatResultsForPrompt(results: any[]): string {
    let formatted = '';
    
    results.forEach((result, index) => {
      formatted += `\n**Analysis ${index + 1}: ${result.analysisType}**\n`;
      formatted += `Description: ${result.metadata?.analysisDescription || 'Statistical analysis'}\n`;
      formatted += `Sample Size: ${result.data?.length || 'Unknown'} data points\n`;
      
      if (result.data && Array.isArray(result.data) && result.data.length > 0) {
        formatted += `Key Results:\n`;
        
        // Show first few rows of data as examples
        const sampleRows = result.data.slice(0, 5);
        sampleRows.forEach((row: any, i: number) => {
          const values = Object.entries(row)
            .map(([key, value]) => `${key}: ${value}`)
            .join(', ');
          formatted += `  Row ${i + 1}: ${values}\n`;
        });
        
        if (result.data.length > 5) {
          formatted += `  ... and ${result.data.length - 5} more rows\n`;
        }
      }
      
      if (result.statistics) {
        formatted += `Statistics: ${JSON.stringify(result.statistics)}\n`;
      }
      
      formatted += '\n';
    });
    
    return formatted;
  }

  private async getCachedInsights(surveyId: number, cacheHours: number): Promise<GeneratedInsights | null> {
    const db = await getMySQLConnection();
    
    // Check for cached insights in the new simplified table
    const [cached] = await db.execute(`
      SELECT analytics_data 
      FROM survey_analytics_cache 
      WHERE survey_id = ? 
        AND status = 'completed'
        AND JSON_EXTRACT(analytics_data, '$.insights') IS NOT NULL
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
      
      // Extract the insights portion
      return fullResult.insights || null;
    } catch (error) {
      console.error('Error parsing cached insights:', error);
      return null;
    }
  }

  private async storeInsights(surveyId: number, insights: GeneratedInsights): Promise<void> {
    // Insights will be stored as part of the complete result by the orchestrator
    // This method is now a no-op since we use centralized storage
    console.log(`Generated insights for survey ${surveyId} - will be stored by orchestrator`);
  }

  private async cacheInsights(surveyId: number, insights: GeneratedInsights): Promise<void> {
    // Insights will be stored as part of the complete result by the orchestrator
    // This method is now a no-op since we use centralized storage
    console.log(`Cached insights for survey ${surveyId} with ${insights.keyFindings.length} key findings`);
  }
} 
