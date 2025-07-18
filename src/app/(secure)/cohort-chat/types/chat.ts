export type ChatMessage = { 
  role: 'user' | 'agent'; 
  content: string; 
  citations?: Record<string, string>; 
  chartSpec?: any; 
  dataCards?: any[]; 
  isUpload?: boolean;
  reportId?: string;
  reportStatus?: 'initiated' | 'processing' | 'completed' | 'failed';
};

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
  surveyId?: number | null;
  cohortId?: number | null;
}

export type StreamingMode = 'off' | 'smart' | 'buffered' | 'instant';

export interface ModelConfig {
  selectedModel: string;
  temperature: number;
  streamingMode: StreamingMode;
  systemPrompt: string;
}

export interface DataSources {
  survey: boolean;
  twins: boolean;
  web: boolean;
} 