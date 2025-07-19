// Survey Query Intent Classification System
// Handles semantic understanding of user queries about survey data

export interface QueryIntent {
  intent: string;
  confidence: number;
  questionTypes: string[];
  analysisType: 'thematic' | 'categorical' | 'sentiment' | 'demographic' | 'statistical';
  minResponseLength?: number;
  excludePatterns?: string[];
  priorityOrder?: string;
}

export interface SurveyIntentConfig {
  keywords: string[];
  questionTypes: string[];
  analysisType: QueryIntent['analysisType'];
  minResponseLength?: number;
  excludePatterns?: string[];
  priorityOrder?: string;
  description: string;
}

// Comprehensive intent taxonomy for survey analysis
const SURVEY_INTENTS: Record<string, SurveyIntentConfig> = {
  'open-ended-themes': {
    keywords: [
      'themes', 'open-ended', 'text responses', 'qualitative', 'narrative', 
      'common themes', 'patterns in responses', 'what people said', 'written responses',
      'free text', 'comments', 'feedback', 'opinions expressed', 'stories', 'experiences',
      'opinions', 'thoughts', 'views', 'perspectives', 'feelings', 'what do people think',
      'respondents think', 'responders opinions', 'user opinions', 'what they said'
    ],
    questionTypes: ['text'],
    analysisType: 'thematic',
    minResponseLength: 15,
    excludePatterns: ['^[0-9\\s\\.,!?-]+$', '^(yes|no|maybe|ok|good|bad)$'],
    priorityOrder: 'text_first',
    description: 'Analysis of themes and patterns in open-ended text responses'
  },
  
  'choice-patterns': {
    keywords: [
      'choices', 'selections', 'options chosen', 'preferences', 'most popular',
      'distribution', 'breakdown', 'which option', 'selected', 'picked',
      'multiple choice', 'single choice', 'voting patterns'
    ],
    questionTypes: ['single-choice', 'multiple-choice'],
    analysisType: 'categorical',
    description: 'Analysis of patterns in multiple choice selections'
  },
  
  'sentiment-analysis': {
    keywords: [
      'sentiment', 'feelings', 'emotions', 'attitudes', 'positive', 'negative',
      'satisfaction', 'happiness', 'mood', 'opinion tone', 'how people feel',
      'emotional response', 'reactions'
    ],
    questionTypes: ['text', 'rating'],
    analysisType: 'sentiment',
    minResponseLength: 10,
    description: 'Analysis of emotional tone and sentiment in responses'
  },
  
  'rating-analysis': {
    keywords: [
      'ratings', 'scores', 'scale', 'average rating', 'satisfaction score',
      'how highly', 'rated', 'scoring', 'scale responses', 'numerical ratings'
    ],
    questionTypes: ['rating'],
    analysisType: 'statistical',
    description: 'Analysis of rating scale responses and scores'
  },
  
  'demographic-breakdown': {
    keywords: [
      'demographics', 'age groups', 'by age', 'by location', 'by gender',
      'breakdown by', 'segmented by', 'different groups', 'population segments',
      'who responded', 'respondent characteristics'
    ],
    questionTypes: ['single-choice', 'multiple-choice', 'text', 'rating'],
    analysisType: 'demographic',
    description: 'Analysis broken down by demographic characteristics'
  },
  
  'popular-mentions': {
    keywords: [
      'most mentioned', 'popular', 'frequently mentioned', 'common mentions',
      'top answers', 'most cited', 'repeatedly mentioned', 'often discussed',
      'who are the', 'what are the most', 'which creators', 'which people'
    ],
    questionTypes: ['text', 'multiple-choice'],
    analysisType: 'thematic',
    minResponseLength: 5,
    description: 'Analysis of frequently mentioned entities, people, or concepts'
  }
};

export class QueryIntentClassifier {
  private intentConfigs = SURVEY_INTENTS;
  
  /**
   * Classify user query intent using keyword matching and semantic analysis
   */
  classifyQuery(query: string): QueryIntent {
    const queryLower = query.toLowerCase();
    const queryWords = this.extractKeywords(queryLower);
    
    let bestMatch: { intent: string; score: number; config: SurveyIntentConfig } | null = null;
    
    // Score each intent based on keyword matches
    for (const [intentName, config] of Object.entries(this.intentConfigs)) {
      const score = this.calculateIntentScore(queryWords, config.keywords);
      
      if (score > 0 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { intent: intentName, score, config };
      }
    }
    
    // Default to thematic analysis if no clear match
    if (!bestMatch) {
      bestMatch = {
        intent: 'open-ended-themes',
        score: 0.3,
        config: this.intentConfigs['open-ended-themes']
      };
    }
    
    // Build the query intent response
    return {
      intent: bestMatch.intent,
      confidence: Math.min(bestMatch.score, 1.0),
      questionTypes: bestMatch.config.questionTypes,
      analysisType: bestMatch.config.analysisType,
      minResponseLength: bestMatch.config.minResponseLength,
      excludePatterns: bestMatch.config.excludePatterns,
      priorityOrder: bestMatch.config.priorityOrder
    };
  }
  
  /**
   * Extract meaningful keywords from query
   */
  private extractKeywords(query: string): string[] {
    // Remove common stop words and extract meaningful terms
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 
      'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'can', 'what', 'how', 'when', 'where', 'why'
    ]);
    
    return query
      .split(/\s+/)
      .map(word => word.replace(/[^\w]/g, ''))
      .filter(word => word.length > 2 && !stopWords.has(word));
  }
  
  /**
   * Calculate semantic similarity score between query and intent keywords
   */
  private calculateIntentScore(queryWords: string[], intentKeywords: string[]): number {
    let totalScore = 0;
    let maxPossibleScore = 0;
    
    for (const keyword of intentKeywords) {
      const keywordWords = keyword.split(/\s+/);
      maxPossibleScore += keywordWords.length;
      
      // Check for exact phrase matches (higher weight)
      if (queryWords.join(' ').includes(keyword)) {
        totalScore += keywordWords.length * 2;
        continue;
      }
      
      // Check for individual word matches
      for (const keywordWord of keywordWords) {
        if (queryWords.some(qw => 
          qw === keywordWord || 
          qw.includes(keywordWord) || 
          keywordWord.includes(qw)
        )) {
          totalScore += 1;
        }
      }
    }
    
    return maxPossibleScore > 0 ? totalScore / maxPossibleScore : 0;
  }
  
  /**
   * Get human-readable explanation of the detected intent
   */
  explainIntent(intent: QueryIntent): string {
    const config = this.intentConfigs[intent.intent];
    if (!config) return 'Unknown intent detected';
    
    return `Detected intent: ${config.description} (confidence: ${Math.round(intent.confidence * 100)}%)`;
  }
  
  /**
   * Get suggested improvements for low-confidence classifications
   */
  getSuggestions(query: string, intent: QueryIntent): string[] {
    if (intent.confidence > 0.7) return [];
    
    const suggestions = [];
    
    if (intent.confidence < 0.4) {
      suggestions.push('Try being more specific about what type of analysis you want');
    }
    
    if (!query.toLowerCase().includes('theme') && !query.toLowerCase().includes('pattern')) {
      suggestions.push('Use words like "themes", "patterns", or "common responses" for thematic analysis');
    }
    
    if (!query.toLowerCase().includes('choice') && !query.toLowerCase().includes('selection')) {
      suggestions.push('Use words like "choices", "selections", or "options" for choice analysis');
    }
    
    return suggestions;
  }
} 