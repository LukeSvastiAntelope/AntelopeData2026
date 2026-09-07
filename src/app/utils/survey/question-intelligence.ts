interface QuestionAnalysis {
  id: number;
  questionText: string;
  questionType: string;
  questionOrder: number;
  isMetadata: boolean;
  relevanceScore: number;
  category: string;
  answerOptions?: string;
}

interface QuestionSelectionResult {
  selectedQuestions: QuestionAnalysis[];
  excludedQuestions: QuestionAnalysis[];
  totalQuestions: number;
  reasoning: string;
}

export class QuestionIntelligence {
  
  /**
   * Analyze and select meaningful questions based on user intent
   */
  async selectMeaningfulQuestions(
    surveyId: number, 
    userQuery: string, 
    db: any,
    maxQuestions: number = 5
  ): Promise<QuestionSelectionResult> {
    
    // Get all questions for the survey
    const [allQuestions] = await db.execute(`
      SELECT 
        id,
        prompt as question_text,
        type as question_type,
        options as answer_options,
        question_order
      FROM survey_questions 
      WHERE survey_id = ? 
      ORDER BY question_order ASC
    `, [surveyId]);

    // Analyze each question
    const analyzedQuestions: QuestionAnalysis[] = allQuestions.map((q: any) => ({
      id: q.id,
      questionText: q.question_text,
      questionType: q.question_type,
      questionOrder: q.question_order,
      answerOptions: q.answer_options,
      isMetadata: this.isMetadataField(q.question_text),
      relevanceScore: this.calculateRelevanceScore(q.question_text, userQuery),
      category: this.categorizeQuestion(q.question_text)
    }));

    // Filter out metadata fields AND open-ended text questions
    const meaningfulQuestions = analyzedQuestions.filter(q => 
      !q.isMetadata && !this.isOpenEndedQuestion(q.questionType)
    );
    
    // Log filtering results
    const textQuestions = analyzedQuestions.filter(q => q.questionType === 'text').length;
    const metadataQuestions = analyzedQuestions.filter(q => q.isMetadata).length;
    
    console.log(`🚫 Filtering questions: ${textQuestions} open-ended text questions, ${metadataQuestions} metadata fields excluded`);
    console.log(`✅ Selected ${meaningfulQuestions.length} structured questions for analysis`);
    
    // Sort by relevance score (highest first)
    meaningfulQuestions.sort((a, b) => b.relevanceScore - a.relevanceScore);
    
    // Intelligent question selection based on query specificity and relevance gaps
    const selectedQuestions = this.selectOptimalQuestions(meaningfulQuestions, userQuery, maxQuestions);
    const excludedQuestions = analyzedQuestions.filter(q => 
      q.isMetadata || this.isOpenEndedQuestion(q.questionType)
    );
    
    const reasoning = this.generateSelectionReasoning(
      selectedQuestions, 
      excludedQuestions, 
      userQuery,
      allQuestions.length
    );

    return {
      selectedQuestions,
      excludedQuestions,
      totalQuestions: allQuestions.length,
      reasoning
    };
  }

  /**
   * Intelligently select optimal number of questions based on relevance and query specificity
   */
  private selectOptimalQuestions(
    meaningfulQuestions: QuestionAnalysis[], 
    userQuery: string, 
    maxQuestions: number
  ): QuestionAnalysis[] {
    if (meaningfulQuestions.length === 0) return [];
    
    // If there's a clear winner with high relevance, focus on that
    const topQuestion = meaningfulQuestions[0];
    const secondQuestion = meaningfulQuestions[1];
    
    // Calculate relevance gap between top questions
    const relevanceGap = secondQuestion ? topQuestion.relevanceScore - secondQuestion.relevanceScore : 0;
    
    // For specific queries ("who are the most popular"), focus on the best match
    const isSpecificQuery = userQuery.toLowerCase().includes('who') || 
                            userQuery.toLowerCase().includes('what') || 
                            userQuery.toLowerCase().includes('which');
    
    // If top question has high relevance and there's a big gap, just use that one
    if (topQuestion.relevanceScore >= 25 && relevanceGap >= 10 && isSpecificQuery) {
      console.log(`🎯 Focused selection: Using 1 highly relevant question (score: ${topQuestion.relevanceScore}, gap: ${relevanceGap})`);
      return [topQuestion];
    }
    
    // For broad queries like "interesting statistics", include more context
    const isBroadQuery = userQuery.toLowerCase().includes('interesting') || 
                        userQuery.toLowerCase().includes('statistics') || 
                        userQuery.toLowerCase().includes('facts');
    
    if (isBroadQuery) {
      // Include questions with scores above a threshold
      const threshold = Math.max(15, topQuestion.relevanceScore * 0.6);
      const contextualQuestions = meaningfulQuestions.filter(q => q.relevanceScore >= threshold);
      const count = Math.min(contextualQuestions.length, maxQuestions);
      console.log(`📊 Broad selection: Using ${count} questions with score >= ${threshold}`);
      return contextualQuestions.slice(0, count);
    }
    
    // Default: include top questions but with dynamic cutoff based on relevance
    const dynamicThreshold = Math.max(10, topQuestion.relevanceScore * 0.5);
    const qualifyingQuestions = meaningfulQuestions.filter(q => q.relevanceScore >= dynamicThreshold);
    const count = Math.min(qualifyingQuestions.length, Math.min(3, maxQuestions)); // Cap at 3 for focused queries
    console.log(`⚖️ Dynamic selection: Using ${count} questions with score >= ${dynamicThreshold}`);
    return qualifyingQuestions.slice(0, count);
  }

  /**
   * Determine if a question should be excluded from analysis
   */
  private isMetadataField(questionText: string): boolean {
    const lowerText = questionText.toLowerCase();
    
    // Administrative/metadata patterns
    const metadataPatterns = [
      'unique id',
      'interview start',
      'interview end',
      'start time',
      'end time',
      'device used',
      'language of interview',
      'form assignment',
      'weight',
      'marital status flag',
      'panelist',
      'respondent id',
      'timestamp',
      'duration',
      'ip address',
      'user agent',
      'session id',
      'response id'
    ];

    // Check for exact matches or partial matches
    return metadataPatterns.some(pattern => 
      lowerText.includes(pattern) || 
      lowerText.startsWith(pattern.split(' ')[0])
    );
  }

  /**
   * Determine if a question is open-ended text and should be excluded
   */
  private isOpenEndedQuestion(questionType: string): boolean {
    // Filter out text questions as they create too many unique responses
    // These are better suited for sentiment analysis (future feature)
    return questionType === 'text';
  }

  /**
   * Calculate relevance score based on user query and question content
   */
  private calculateRelevanceScore(questionText: string, userQuery: string): number {
    const lowerQuestion = questionText.toLowerCase();
    const lowerQuery = userQuery.toLowerCase();
    
    let score = 0;
    
    // Base score for all non-metadata questions
    score += 10;
    
    // HIGH PRIORITY: Direct semantic matches for specific queries
    if (lowerQuery.includes('popular') || lowerQuery.includes('most') || lowerQuery.includes('top')) {
      if (lowerQuestion.includes('content creator') || lowerQuestion.includes('influencer') || 
          lowerQuestion.includes('which') || lowerQuestion.includes('who')) {
        score += 50; // Very high score for direct matches
        console.log(`🎯 Direct match bonus: +50 for "${questionText.substring(0, 60)}..."`);
      }
    }
    
    if (lowerQuery.includes('who') || lowerQuery.includes('which')) {
      if (lowerQuestion.includes('which') || lowerQuestion.includes('who') || 
          lowerQuestion.includes('have you') || lowerQuestion.includes('following')) {
        score += 40; // High score for question-answer alignment
        console.log(`❓ Question alignment bonus: +40 for "${questionText.substring(0, 60)}..."`);
      }
    }
    
    if (lowerQuery.includes('consume') || lowerQuery.includes('content')) {
      if (lowerQuestion.includes('consume') || lowerQuestion.includes('content') || 
          lowerQuestion.includes('often') || lowerQuestion.includes('frequency')) {
        score += 45; // High score for consumption questions
        console.log(`📺 Content match bonus: +45 for "${questionText.substring(0, 60)}..."`);
      }
    }
    
    // MEDIUM PRIORITY: Broad interesting topics + general content relevance
    if (lowerQuery.includes('interesting') || lowerQuery.includes('statistics') || lowerQuery.includes('facts')) {
      // Give moderate scores to any substantial survey question for broad queries
      if (questionText.length > 40) {
        score += 12; // Base interesting score for substantial questions
      }
      
      const interestingTopics = [
        'social media', 'government', 'politics', 'technology', 'education',
        'healthcare', 'economy', 'climate', 'regulation', 'bias', 'censorship',
        'power', 'influence', 'effect', 'impact', 'opinion', 'compare', 'content', 'creator'
      ];
      
      interestingTopics.forEach(topic => {
        if (lowerQuestion.includes(topic)) {
          score += 15;
        }
      });
    }
    
    // Bonus for multiple choice questions (better for statistics)
    if (lowerQuestion.includes('please compare') || 
        lowerQuestion.includes('how much') ||
        lowerQuestion.includes('what effect')) {
      score += 10;
    }
    
    // Penalty for very short questions (likely administrative)
    if (questionText.length < 30) {
      score -= 5;
    }
    
    // Bonus for detailed questions
    if (questionText.length > 100) {
      score += 5;
    }
    
    return Math.max(0, score);
  }

  /**
   * Categorize questions by topic
   */
  private categorizeQuestion(questionText: string): string {
    const lowerText = questionText.toLowerCase();
    
    if (lowerText.includes('social media') || lowerText.includes('technology')) {
      return 'Technology & Social Media';
    }
    
    if (lowerText.includes('government') || lowerText.includes('politics') || lowerText.includes('power')) {
      return 'Government & Politics';
    }
    
    if (lowerText.includes('education') || lowerText.includes('stem')) {
      return 'Education';
    }
    
    if (lowerText.includes('healthcare') || lowerText.includes('health')) {
      return 'Healthcare';
    }
    
    if (lowerText.includes('economy') || lowerText.includes('economic')) {
      return 'Economics';
    }
    
    if (lowerText.includes('compare') || lowerText.includes('standard of living')) {
      return 'International Comparison';
    }
    
    return 'General Survey';
  }

  /**
   * Generate human-readable reasoning for the selection
   */
  private generateSelectionReasoning(
    selected: QuestionAnalysis[], 
    excluded: QuestionAnalysis[], 
    userQuery: string,
    totalQuestions: number
  ): string {
    const categories = [...new Set(selected.map(q => q.category))];
    const avgScore = selected.reduce((sum, q) => sum + q.relevanceScore, 0) / selected.length;
    
    // Count different types of excluded questions
    const metadataCount = excluded.filter(q => 
      this.isMetadataField(q.questionText)
    ).length;
    const openEndedCount = excluded.filter(q => 
      this.isOpenEndedQuestion(q.questionType)
    ).length;
    
    let reasoning = `Selected ${selected.length} most relevant questions out of ${totalQuestions} total questions. `;
    
    if (metadataCount > 0 && openEndedCount > 0) {
      reasoning += `Excluded ${metadataCount} metadata fields and ${openEndedCount} open-ended text questions. `;
    } else if (metadataCount > 0) {
      reasoning += `Excluded ${metadataCount} metadata/administrative fields. `;
    } else if (openEndedCount > 0) {
      reasoning += `Excluded ${openEndedCount} open-ended text questions. `;
    }
    
    reasoning += `Selected questions cover: ${categories.join(', ')}. `;
    reasoning += `Average relevance score: ${avgScore.toFixed(1)}/100. `;
    
    if (userQuery.toLowerCase().includes('interesting')) {
      reasoning += 'Prioritized structured questions (multiple choice, ratings, scales) for clear statistical insights.';
    }
    
    return reasoning;
  }

  /**
   * Generate targeted SQL queries for selected questions
   */
  async generateQuestionAnalytics(
    selectedQuestions: QuestionAnalysis[], 
    surveyId: number, 
    db: any
  ): Promise<any[]> {
    const analytics = [];
    
    for (const question of selectedQuestions) {
      try {
        // Get response distribution for this question
        const [responses] = await db.execute(`
          SELECT 
            answer_value,
            COUNT(*) as count,
            ROUND((COUNT(*) * 100.0 / (
              SELECT COUNT(*) 
              FROM survey_answers sa2 
              JOIN survey_responses sr2 ON sa2.response_id = sr2.id 
              WHERE sa2.question_id = ? AND sr2.survey_id = ?
            )), 1) as percentage
          FROM survey_answers sa
          JOIN survey_responses sr ON sa.response_id = sr.id
          WHERE sa.question_id = ? 
          AND sr.survey_id = ?
          AND sa.answer_value IS NOT NULL
          AND sa.answer_value != ''
          GROUP BY answer_value
          ORDER BY count DESC
          LIMIT 10
        `, [question.id, surveyId, question.id, surveyId]);

        if (responses.length > 0) {
          analytics.push({
            questionId: question.id,
            questionText: question.questionText,
            category: question.category,
            analysisType: 'distribution',
            title: `${question.category}: ${question.questionText.substring(0, 60)}...`,
            description: `Response distribution for ${question.category.toLowerCase()} question`,
            data: responses.map((r: any) => ({
              answer_value: r.answer_value,
              count: r.count,
              percentage: r.percentage
            })),
            totalResponses: responses.reduce((sum: number, r: any) => sum + r.count, 0)
          });
        }
      } catch (error) {
        console.error(`Error analyzing question ${question.id}:`, error);
      }
    }
    
    return analytics;
  }
} 