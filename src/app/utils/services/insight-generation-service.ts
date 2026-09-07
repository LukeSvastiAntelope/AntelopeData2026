// Insight Generation Service - Converts statistical results into meaningful insights using LLM
import OpenAI from 'openai';
import { openSql as getMySQLConnection } from '../database/db';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { SurveyAnalysisResult } from './survey-analysis-types';
import { StatisticalQueryResult } from './statistical-query-generator';
import { createCompletion } from './ai-service';

// NOTE: This file routes LLM calls through `createCompletion()` which lazily
// initializes provider clients. Do not instantiate OpenAI at module-load time
// because it makes `next build` fail when keys are not present.

export interface InsightGenerationConfig {
  insightModel?: string;
  forceRegenerate?: boolean;
  cacheExpirationHours?: number;
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
}

export class InsightGenerationService {
  private defaultModel: string;
  private defaultCacheHours: number;

  constructor(
    defaultModel: string = 'gpt-4o', // Best model for insight generation
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
      model
    );

    // Cache the insights
    await this.cacheInsights(surveyId, insights);

    return insights;
  }

  private async generateInsightsWithAI(
    surveyId: number,
    statisticalResults: any[],
    analysisMetadata: any,
    model: string
  ): Promise<GeneratedInsights> {
    const systemPrompt = `You are a senior data analyst and business intelligence expert. Your role is to transform statistical survey results into actionable business insights.

You excel at:
- Identifying patterns and trends in data
- Translating statistical findings into business language
- Providing actionable recommendations
- Assessing data quality and limitations
- Prioritizing insights by business impact

CRITICAL: Return ONLY valid JSON with no additional text, explanations, or markdown formatting.`;

    const userPrompt = `Analyze these survey results and generate comprehensive business insights:

**Survey Context:**
- Survey ID: ${surveyId}
- Survey Type: ${analysisMetadata.surveyType}
- Main Themes: ${analysisMetadata.mainThemes?.join(', ')}
- Analysis Complexity: ${analysisMetadata.analysisComplexity}

**Statistical Results:**
${this.formatResultsForPrompt(statisticalResults)}

**Analysis Metadata:**
${JSON.stringify(analysisMetadata, null, 2)}

Generate insights in this exact JSON structure:
{
  "surveyId": ${surveyId},
  "executiveSummary": "2-3 sentence high-level summary of key findings and implications",
  "keyFindings": [
    {
      "title": "Clear, actionable finding title",
      "description": "Detailed explanation of the finding",
      "statisticalEvidence": "Supporting data and statistics",
      "businessImplication": "What this means for the business/organization",
      "confidence": "high|medium|low",
      "priority": "critical|important|notable"
    }
  ],
  "demographicInsights": [
    {
      "segment": "Demographic group (e.g., 'Age 25-34', 'High Income')",
      "finding": "Key insight about this segment",
      "comparison": "How this segment differs from others",
      "actionable": "Specific action recommendations for this segment"
    }
  ],
  "correlationInsights": [
    {
      "variables": ["Variable 1", "Variable 2"],
      "relationship": "Description of the relationship",
      "strength": "strong|moderate|weak",
      "interpretation": "What this relationship means",
      "businessRelevance": "Why this matters for business decisions"
    }
  ],
  "recommendations": [
    {
      "category": "Area of focus (e.g., 'Product Development', 'Customer Service')",
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
  "nextSteps": ["array", "of", "recommended", "next", "steps"]
}

**Guidelines:**
- Focus on actionable insights, not just data descriptions
- Prioritize findings by business impact and statistical significance
- Be specific about recommendations and timeframes
- Acknowledge data limitations honestly
- Use business language, not statistical jargon
- Identify 3-7 key findings, 2-5 demographic insights, and 3-8 recommendations`;

    console.log(`Generating insights for survey ${surveyId} with model: ${model}`);
    
    const response = await createCompletion({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.4, // Balanced creativity and consistency
      maxTokens: 8000
    });

    let insights: GeneratedInsights;
    try {
      // Clean up the response content to handle markdown code blocks
      let cleanedContent = response.content;
      
      // Remove markdown code blocks if present
      cleanedContent = cleanedContent.replace(/```json\s*/g, '').replace(/```\s*$/g, '');
      
      // Remove any leading/trailing whitespace
      cleanedContent = cleanedContent.trim();
      
      insights = JSON.parse(cleanedContent);
    } catch (error) {
      console.error('Failed to parse AI insights response:', response.content);
      throw new Error('AI returned invalid JSON response for insights');
    }

    // Validate insights structure
    if (!insights.executiveSummary || !insights.keyFindings || !Array.isArray(insights.keyFindings)) {
      throw new Error('AI insights missing required fields');
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
