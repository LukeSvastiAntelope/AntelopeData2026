// Survey Analysis Engine - AI-powered survey understanding and analysis planning
import { openSql } from '../database/db';
import { createCompletion } from './ai-service';
import {
  profileQuestions,
  QuestionProfile,
  normalizeQuestionOptions
} from '../survey/question-profiler';
import {
  buildAnalysisUserPrompt,
  buildHeuristicAnalysis,
  mergeAnalysisWithHeuristics
} from './survey-analysis-helpers';
import {
  SurveyAnalysisConfig,
  SurveyAnalysisResult
} from './survey-analysis-types';
export type { SurveyAnalysisConfig, SurveyAnalysisResult } from './survey-analysis-types';

interface SurveyDataPayload {
  id: number;
  title: string;
  description?: string | null;
  questions: any[];
  questionProfiles: QuestionProfile[];
  responseCount: number;
}

export class SurveyAnalysisEngine {
  private defaultModel: string;

  constructor(defaultModel: string = 'gpt-4o') {
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

  private async performAIAnalysis(
    surveyData: SurveyDataPayload,
    model: string
  ): Promise<SurveyAnalysisResult> {
    const systemPrompt = `You are a survey analysis expert. Analyze the provided survey data and return a comprehensive analysis in the exact JSON format specified.

Your task is to understand the survey's purpose, categorize questions, and suggest meaningful statistical analyses.

CRITICAL: Return ONLY valid JSON with no additional text, explanations, or markdown formatting.`;

    const surveyMeta = {
      id: surveyData.id,
      title: surveyData.title,
      description: surveyData.description,
      responseCount: surveyData.responseCount,
      questions: surveyData.questions
    };

    const heuristicFallback = buildHeuristicAnalysis(
      surveyMeta,
      surveyData.questionProfiles
    );

    const userPrompt = buildAnalysisUserPrompt(
      surveyMeta,
      surveyData.questionProfiles
    );

    console.log(`Analyzing survey ${surveyData.id} with model: ${model}`);

    let aiResult: SurveyAnalysisResult | null = null;
    try {
      const response = await createCompletion({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        maxTokens: 4000
      });

      const rawContent =
        typeof response.content === 'string'
          ? response.content
          : JSON.stringify(response.content);

      aiResult = JSON.parse(rawContent);

      aiResult.questionCategories = aiResult.questionCategories ?? {
        demographic: [],
        opinion: [],
        behavioral: [],
        categorical: []
      };

      aiResult.suggestedAnalyses = aiResult.suggestedAnalyses ?? {
        distributions: [],
        crossTabs: [],
        correlations: [],
        segmentations: []
      };

      aiResult.mainThemes = aiResult.mainThemes ?? [];
      aiResult.demographicFields = aiResult.demographicFields ?? [];
      aiResult.keyMetrics = aiResult.keyMetrics ?? [];
      aiResult.analysisComplexity =
        aiResult.analysisComplexity ?? heuristicFallback.analysisComplexity;
      aiResult.estimatedAnalysisTime =
        aiResult.estimatedAnalysisTime ?? heuristicFallback.estimatedAnalysisTime;
      aiResult.surveyType = aiResult.surveyType ?? heuristicFallback.surveyType;
    } catch (error) {
      console.warn('AI analysis failed, falling back to heuristics:', error);
      aiResult = null;
    }

    return mergeAnalysisWithHeuristics(aiResult, heuristicFallback);
  }

  private async getSurveyData(surveyId: number): Promise<SurveyDataPayload> {
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
      options: normalizeQuestionOptions(q.options)
    }));

    const questionProfiles = profileQuestions(questionsWithOptions);

    // Get response count
    const [responseCount] = await db.execute(
      'SELECT COUNT(*) as count FROM survey_responses WHERE survey_id = ?',
      [surveyId]
    ) as any[];

    return {
      ...surveyData,
      questions: questionsWithOptions,
      questionProfiles,
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
