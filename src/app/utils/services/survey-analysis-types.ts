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
