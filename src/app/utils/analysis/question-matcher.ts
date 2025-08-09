/**
 * Semantic Question Matcher
 * 
 * This utility matches user queries to relevant survey questions using semantic analysis,
 * keyword matching, and conceptual understanding.
 */

export interface QuestionSchema {
  id: string;
  question_text: string;
  question_type: 'multiple_choice' | 'scale' | 'text' | 'demographic' | 'yes_no' | 'other';
  category: 'demographic' | 'attitude' | 'behavior' | 'opinion' | 'factual' | 'other';
  response_options: string[];
  variable_name: string;
  analysis_tags: string[];
  is_demographic: boolean;
  semantic_keywords: string[];
}

export interface MatchResult {
  question: QuestionSchema;
  relevanceScore: number;
  matchReasons: string[];
  matchType: 'exact' | 'semantic' | 'conceptual' | 'demographic';
}

export interface AnalysisContext {
  primaryQuestions: QuestionSchema[];
  demographicQuestions: QuestionSchema[];
  suggestedAnalysisType: 'correlation' | 'comparison' | 'distribution' | 'regression' | 'crosstab';
  confidenceScore: number;
}

export class SemanticQuestionMatcher {
  private questions: QuestionSchema[] = [];
  private demographics: QuestionSchema[] = [];

  constructor(questions: QuestionSchema[], demographics: QuestionSchema[]) {
    this.questions = questions;
    this.demographics = demographics;
  }

  /**
   * Main method to find relevant questions for a user query
   */
  findRelevantQuestions(
    userQuery: string, 
    maxResults: number = 5,
    includeDemographics: boolean = true
  ): AnalysisContext {
    console.log('🔍 Semantic Matcher - Processing query:', userQuery);
    
    const queryTerms = this.extractQueryTerms(userQuery);
    const analysisIntent = this.detectAnalysisIntent(userQuery);
    
    console.log('🔍 Semantic Matcher - Query terms:', queryTerms);
    console.log('🔍 Semantic Matcher - Analysis intent:', analysisIntent);

    // Find matches for primary questions
    const primaryMatches = this.matchQuestions(this.questions, queryTerms, analysisIntent);
    
    // Find relevant demographics based on the query
    const demographicMatches = includeDemographics ? 
      this.matchDemographics(queryTerms, analysisIntent) : [];

    // Sort and limit results
    const topPrimaryQuestions = primaryMatches
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, maxResults)
      .map(match => match.question);

    const topDemographicQuestions = demographicMatches
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 3) // Limit demographics to top 3
      .map(match => match.question);

    // Determine suggested analysis type
    const suggestedAnalysisType = this.suggestAnalysisType(
      userQuery, 
      topPrimaryQuestions, 
      topDemographicQuestions
    );

    // Calculate confidence score
    const confidenceScore = this.calculateConfidenceScore(
      primaryMatches,
      demographicMatches,
      analysisIntent
    );

    const context: AnalysisContext = {
      primaryQuestions: topPrimaryQuestions,
      demographicQuestions: topDemographicQuestions,
      suggestedAnalysisType,
      confidenceScore
    };

    console.log('🔍 Semantic Matcher - Final context:', {
      primaryQuestions: context.primaryQuestions.length,
      demographicQuestions: context.demographicQuestions.length,
      suggestedAnalysisType: context.suggestedAnalysisType,
      confidenceScore: context.confidenceScore
    });

    return context;
  }

  /**
   * Extract meaningful terms from user query
   */
  private extractQueryTerms(query: string): string[] {
    const terms = query.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(term => term.length > 2 && !this.isStopWord(term));

    // Add synonyms and related terms
    const expandedTerms = new Set(terms);
    
    terms.forEach(term => {
      const synonyms = this.getSynonyms(term);
      synonyms.forEach(synonym => expandedTerms.add(synonym));
    });

    return Array.from(expandedTerms);
  }

  /**
   * Detect the type of analysis the user is asking for
   */
  private detectAnalysisIntent(query: string): {
    type: string;
    keywords: string[];
    confidence: number;
  } {
    const query_lower = query.toLowerCase();

    // Correlation analysis
    if (/\b(correlation|relationship|related|association|connection|link|influence|affect|impact)\b/.test(query_lower)) {
      return {
        type: 'correlation',
        keywords: ['correlation', 'relationship', 'related'],
        confidence: 0.9
      };
    }

    // Comparison analysis
    if (/\b(compare|comparison|difference|versus|vs|between|better|worse|higher|lower)\b/.test(query_lower)) {
      return {
        type: 'comparison',
        keywords: ['compare', 'difference', 'between'],
        confidence: 0.85
      };
    }

    // Distribution analysis
    if (/\b(distribution|spread|range|most|least|common|frequency|percentage|breakdown)\b/.test(query_lower)) {
      return {
        type: 'distribution',
        keywords: ['distribution', 'frequency', 'breakdown'],
        confidence: 0.8
      };
    }

    // Regression/predictive analysis
    if (/\b(predict|prediction|determine|factor|cause|explain|model|regression)\b/.test(query_lower)) {
      return {
        type: 'regression',
        keywords: ['predict', 'factor', 'determine'],
        confidence: 0.75
      };
    }

    // Cross-tabulation
    if (/\b(crosstab|cross|tab|by|group|segment|category)\b/.test(query_lower)) {
      return {
        type: 'crosstab',
        keywords: ['group', 'category', 'segment'],
        confidence: 0.7
      };
    }

    return {
      type: 'distribution',
      keywords: [],
      confidence: 0.5
    };
  }

  /**
   * Match questions against query terms and intent
   */
  private matchQuestions(
    questions: QuestionSchema[], 
    queryTerms: string[], 
    analysisIntent: any
  ): MatchResult[] {
    return questions.map(question => {
      let score = 0;
      const matchReasons: string[] = [];

      // Exact keyword matches in question text
      const questionText = question.question_text.toLowerCase();
      let exactMatches = 0;
      queryTerms.forEach(term => {
        if (questionText.includes(term)) {
          score += 10;
          exactMatches++;
        }
      });

      if (exactMatches > 0) {
        matchReasons.push(`${exactMatches} exact keyword matches`);
      }

      // Semantic keyword matches
      let semanticMatches = 0;
      question.semantic_keywords.forEach(keyword => {
        queryTerms.forEach(term => {
          if (keyword.includes(term) || term.includes(keyword)) {
            score += 5;
            semanticMatches++;
          }
        });
      });

      if (semanticMatches > 0) {
        matchReasons.push(`${semanticMatches} semantic matches`);
      }

      // Analysis tag matches
      let tagMatches = 0;
      question.analysis_tags.forEach(tag => {
        if (analysisIntent.keywords.some(keyword => tag.includes(keyword))) {
          score += 8;
          tagMatches++;
        }
      });

      if (tagMatches > 0) {
        matchReasons.push(`${tagMatches} analysis tag matches`);
      }

      // Response option matches
      let optionMatches = 0;
      question.response_options.forEach(option => {
        const optionText = option.toLowerCase();
        queryTerms.forEach(term => {
          if (optionText.includes(term)) {
            score += 3;
            optionMatches++;
          }
        });
      });

      if (optionMatches > 0) {
        matchReasons.push(`${optionMatches} response option matches`);
      }

      // Question type bonus for analysis intent
      if (this.isQuestionTypeRelevant(question.question_type, analysisIntent.type)) {
        score += 5;
        matchReasons.push('question type fits analysis intent');
      }

      // Determine match type
      let matchType: MatchResult['matchType'] = 'conceptual';
      if (exactMatches >= 2) matchType = 'exact';
      else if (semanticMatches >= 2) matchType = 'semantic';
      else if (tagMatches >= 1) matchType = 'conceptual';

      return {
        question,
        relevanceScore: score,
        matchReasons,
        matchType
      };
    }).filter(match => match.relevanceScore > 0);
  }

  /**
   * Match demographic questions based on analysis needs
   */
  private matchDemographics(queryTerms: string[], analysisIntent: any): MatchResult[] {
    // Always include common demographics for correlational analysis
    const commonDemographics = ['gender', 'age', 'education', 'income', 'location'];
    
    return this.demographics.map(demo => {
      let score = 0;
      const matchReasons: string[] = [];

      // Check if query mentions specific demographics
      const demoText = demo.question_text.toLowerCase();
      let directMention = false;
      
      queryTerms.forEach(term => {
        if (demoText.includes(term)) {
          score += 15;
          directMention = true;
        }
      });

      if (directMention) {
        matchReasons.push('directly mentioned in query');
      }

      // Common demographics get baseline score for correlational analysis
      if (analysisIntent.type === 'correlation' || analysisIntent.type === 'comparison') {
        const demoKeywords = demo.semantic_keywords.join(' ').toLowerCase();
        commonDemographics.forEach(commonDemo => {
          if (demoKeywords.includes(commonDemo)) {
            score += 8;
            matchReasons.push(`relevant ${commonDemo} demographic`);
          }
        });
      }

      // Boost score if demographic is commonly used for analysis
      if (this.isAnalyticallyUsefulDemographic(demo)) {
        score += 5;
        matchReasons.push('analytically useful demographic');
      }

      return {
        question: demo,
        relevanceScore: score,
        matchReasons,
        matchType: directMention ? 'exact' : 'demographic' as MatchResult['matchType']
      };
    }).filter(match => match.relevanceScore > 0);
  }

  /**
   * Suggest the most appropriate analysis type
   */
  private suggestAnalysisType(
    query: string,
    primaryQuestions: QuestionSchema[],
    demographicQuestions: QuestionSchema[]
  ): AnalysisContext['suggestedAnalysisType'] {
    const intent = this.detectAnalysisIntent(query);
    
    // Use detected intent if confidence is high
    if (intent.confidence > 0.8) {
      return intent.type as AnalysisContext['suggestedAnalysisType'];
    }

    // Infer from question types and combinations
    const hasScale = primaryQuestions.some(q => q.question_type === 'scale');
    const hasMultipleQuestions = primaryQuestions.length > 1;
    const hasDemographics = demographicQuestions.length > 0;

    if (hasScale && hasDemographics && hasMultipleQuestions) {
      return 'correlation';
    } else if (hasDemographics && hasMultipleQuestions) {
      return 'comparison';
    } else if (hasMultipleQuestions) {
      return 'crosstab';
    } else {
      return 'distribution';
    }
  }

  /**
   * Calculate overall confidence in the matching results
   */
  private calculateConfidenceScore(
    primaryMatches: MatchResult[],
    demographicMatches: MatchResult[],
    analysisIntent: any
  ): number {
    if (primaryMatches.length === 0) return 0;

    const avgPrimaryScore = primaryMatches.reduce((sum, match) => sum + match.relevanceScore, 0) / primaryMatches.length;
    const maxPrimaryScore = Math.max(...primaryMatches.map(match => match.relevanceScore));
    
    let confidence = Math.min(1, (avgPrimaryScore + maxPrimaryScore) / 40); // Normalize to 0-1
    
    // Boost confidence for clear analysis intent
    confidence *= analysisIntent.confidence;
    
    // Boost confidence if we found good demographic matches
    if (demographicMatches.length > 0) {
      confidence *= 1.1;
    }

    return Math.min(1, confidence);
  }

  // Helper methods
  private isStopWord(word: string): boolean {
    const stopWords = new Set([
      'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
      'by', 'from', 'up', 'about', 'into', 'through', 'during', 'before',
      'after', 'above', 'below', 'out', 'off', 'down', 'under', 'again',
      'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why',
      'how', 'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other',
      'some', 'such', 'only', 'own', 'same', 'than', 'too', 'very', 'can',
      'will', 'just', 'should', 'now'
    ]);
    
    return stopWords.has(word.toLowerCase());
  }

  private getSynonyms(term: string): string[] {
    const synonymMap: { [key: string]: string[] } = {
      'gender': ['sex', 'male', 'female'],
      'driving': ['transportation', 'commuting', 'travel', 'mobility'],
      'experience': ['skill', 'expertise', 'proficiency', 'competence'],
      'safety': ['security', 'risk', 'danger', 'safe'],
      'satisfaction': ['happy', 'pleased', 'content', 'rating'],
      'age': ['years', 'old', 'young', 'elderly'],
      'education': ['school', 'college', 'degree', 'learning'],
      'income': ['salary', 'earnings', 'money', 'financial'],
      'location': ['area', 'region', 'place', 'city', 'country'],
      'frequency': ['often', 'sometimes', 'rarely', 'never', 'always']
    };

    return synonymMap[term] || [];
  }

  private isQuestionTypeRelevant(questionType: string, analysisType: string): boolean {
    const relevanceMap: { [key: string]: string[] } = {
      'correlation': ['scale', 'multiple_choice'],
      'comparison': ['scale', 'multiple_choice', 'yes_no'],
      'distribution': ['multiple_choice', 'scale', 'yes_no'],
      'regression': ['scale'],
      'crosstab': ['multiple_choice', 'yes_no', 'demographic']
    };

    return relevanceMap[analysisType]?.includes(questionType) || false;
  }

  private isAnalyticallyUsefulDemographic(question: QuestionSchema): boolean {
    const usefulDemographics = ['gender', 'age', 'education', 'income', 'location', 'employment'];
    const questionText = question.question_text.toLowerCase();
    
    return usefulDemographics.some(demo => questionText.includes(demo));
  }
}