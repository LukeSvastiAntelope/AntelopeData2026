export interface SurveyField {
  name: string;
  label: string;
  type: string;
}

export interface Survey {
  id: number;
  title: string;
}

export interface SurveyQuestion {
  id: string;
  text: string;
  type: 'rating' | 'scale' | 'single-choice' | 'multiple-choice' | 'text';
}

export interface SurveyData {
  id: number;
  title: string;
  questions: SurveyQuestion[];
  fields: SurveyField[];
}

export interface ChartData {
  id: string;
  title: string;
  description: string;
  chart_type: 'horizontal_bar' | 'metric_card' | 'pie';
  data: any[];
  metadata?: {
    total_responses: number;
    analysis_type: string;
  };
} 