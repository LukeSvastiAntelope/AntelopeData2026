// Survey Analysis Engine - AI-powered survey understanding and analysis planning
import { openSql } from '../database/db';
import { createCompletion } from './ai-service';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

export interface SurveyAnalysisConfig {
  analysisModel?: string;
  forceRegenerate?: boolean;
}

export interface SurveyAnalysisResult {
  surveyId: number;
  surveyType: string;
  mainThemes: string[];
  questionCategories: {
    demographic: string[];
    opinion: string[];
    behavioral: string[];
    categorical: string[];
  };
  suggestedAnalyses: {
    distributions: string[];
    crossTabs: Array<{ var1: string; var2: string; rationale: string }>;
    correlations: Array<{ var1: string; var2: string; rationale: string }>;
    segmentations: Array<{ segmentBy: string; analyzeVars: string[]; rationale: string }>;
  };
  demographicFields: string[];
  keyMetrics: string[];
  analysisComplexity: 'simple' | 'moderate' | 'complex';
  estimatedAnalysisTime: number;
}

export class SurveyAnalysisEngine {
  private defaultModel: string;

  constructor(defaultModel: string = 'claude-3-5-sonnet-latest') {
    this.defaultModel = defaultModel;
  }

  async analyzeSurvey(surveyId: number, config: SurveyAnalysisConfig = {}): Promise<SurveyAnalysisResult> {
    const model = config.analysisModel || this.defaultModel;
    
    // Check for existing analysis unless force regenerate
    if (!config.forceRegenerate) {
      const existing = await this.getExistingAnalysis(surveyId);
      if (existing) {
        console.log(`Using cached analysis for survey ${surveyId}`);
        return existing;
      }
    }

    // Get survey data
    const surveyData = await this.getSurveyData(surveyId);
    if (!surveyData.questions || surveyData.questions.length === 0) {
      throw new Error(`No questions found for survey ${surveyId}`);
    }

    // Analyze survey content using AI
    const analysisResult = await this.performAIAnalysis(surveyData, model);
    
    // Store analysis in database
    await this.storeAnalysis(surveyId, analysisResult);
    
    return analysisResult;
  }

  private async performAIAnalysis(surveyData: any, model: string): Promise<SurveyAnalysisResult> {
    const systemPrompt = `You are a survey analysis expert. Analyze the provided survey data and return a comprehensive analysis in the exact JSON format specified.

Your task is to understand the survey's purpose, categorize questions, and suggest meaningful statistical analyses.

CRITICAL: Return ONLY valid JSON with no additional text, explanations, or markdown formatting.`;

    const userPrompt = `Analyze this survey data:

**Survey Title:** ${surveyData.title}
**Description:** ${surveyData.description || 'No description provided'}
**Total Questions:** ${surveyData.questions.length}
**Total Responses:** ${surveyData.responseCount}

**Questions and Options:**
${surveyData.questions.map((q: any, i: number) => `
${i + 1}. **${q.prompt}** (Type: ${q.type})
   ${q.options ? `Options: ${q.options.map((opt: any) => `"${typeof opt === 'string' ? opt : JSON.stringify(opt)}"`).join(', ')}` : 'No predefined options'}
`).join('')}

Return a JSON object with this exact structure:
{
  "surveyId": ${surveyData.id},
  "surveyType": "string - primary category (e.g., 'Customer Satisfaction', 'Political Opinion', 'Employee Engagement')",
  "mainThemes": ["array", "of", "key", "themes"],
  "questionCategories": {
    "demographic": ["question_ids for age, gender, location, etc."],
    "opinion": ["question_ids for opinions, ratings, satisfaction"],
    "behavioral": ["question_ids for actions, frequency, usage"],
    "categorical": ["question_ids for simple categorization"]
  },
  "suggestedAnalyses": {
    "distributions": ["question_ids that need distribution analysis"],
    "crossTabs": [
      {"var1": "question_id", "var2": "question_id", "rationale": "why this cross-tab is meaningful"}
    ],
    "correlations": [
      {"var1": "question_id", "var2": "question_id", "rationale": "why this correlation is interesting"}
    ],
    "segmentations": [
      {"segmentBy": "question_id", "analyzeVars": ["question_ids"], "rationale": "why this segmentation is valuable"}
    ]
  },
  "demographicFields": ["question_ids that can be used for demographic segmentation"],
  "keyMetrics": ["question_ids representing the most important survey outcomes"],
  "analysisComplexity": "simple|moderate|complex",
  "estimatedAnalysisTime": number_in_minutes
}

Use actual question_id values from the survey data. Focus on meaningful statistical relationships.`;

    console.log(`Analyzing survey ${surveyData.id} with model: ${model}`);
    
    const response = await createCompletion({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      maxTokens: 4000
    });

    let analysisResult: SurveyAnalysisResult;
    try {
      analysisResult = JSON.parse(response.content);
    } catch (error) {
      console.error('Failed to parse AI analysis response:', response.content);
      throw new Error('AI returned invalid JSON response');
    }

    // Validate the result has required fields
    if (!analysisResult.surveyType || !analysisResult.questionCategories) {
      throw new Error('AI analysis missing required fields');
    }

    return analysisResult;
  }

  private async getSurveyData(surveyId: number) {
    const db = await openSql();
    
    const [survey] = await db.execute(
      'SELECT * FROM surveys WHERE id = ?',
      [surveyId]
    ) as any[];

    if (!survey || survey.length === 0) {
      throw new Error(`Survey ${surveyId} not found`);
    }

    const surveyData = survey[0];

    // Get questions with options (stored as JSON in the options column)
    const [questions] = await db.execute(`
      SELECT 
        id,
        survey_id,
        type,
        prompt,
        options,
        is_required,
        question_order,
        created_at
      FROM survey_questions 
      WHERE survey_id = ?
      ORDER BY question_order ASC
    `, [surveyId]) as any[];

    // Parse options JSON if it exists
    const questionsWithOptions = questions.map((q: any) => ({
      ...q,
      options: q.options ? (Array.isArray(q.options) ? q.options : JSON.parse(q.options)) : null
    }));

    // Get response count
    const [responseCount] = await db.execute(
      'SELECT COUNT(*) as count FROM survey_responses WHERE survey_id = ?',
      [surveyId]
    ) as any[];

    return {
      ...surveyData,
      questions: questionsWithOptions,
      responseCount: responseCount[0]?.count || 0
    };
  }

  private async getExistingAnalysis(surveyId: number): Promise<SurveyAnalysisResult | null> {
    const db = await openSql();
    
    // Check for existing analysis in the new simplified table
    const [existing] = await db.execute(`
      SELECT analytics_data 
      FROM survey_analytics_cache 
      WHERE survey_id = ? 
        AND status = 'completed'
        AND JSON_EXTRACT(analytics_data, '$.analysis') IS NOT NULL
      ORDER BY created_at DESC 
      LIMIT 1
    `, [surveyId]) as any[];

    if (!existing || existing.length === 0) {
      return null;
    }

    try {
      const analyticsData = existing[0].analytics_data;
      const fullResult = typeof analyticsData === 'string' ? JSON.parse(analyticsData) : analyticsData;
      
      // Extract just the analysis portion
      return fullResult.analysis || null;
    } catch (error) {
      console.error('Error parsing cached analysis:', error);
      return null;
    }
  }

  private async storeAnalysis(surveyId: number, analysis: SurveyAnalysisResult): Promise<void> {
    // Analysis will be stored as part of the complete result by the orchestrator
    // This method is now a no-op since we use centralized storage
    console.log(`Analysis for survey ${surveyId} will be stored by orchestrator`);
  }
} 