import { createCompletion } from "../services/ai-service";

interface SimpleQuestion {
  id: number;
  prompt: string;
  type: string;
  question_order: number;
}

interface QuestionMatch {
  question: SimpleQuestion;
  relevanceScore: number;
  reasoning: string;
  topicCategory?: string; // New: track which topic this question relates to
}

interface MatchResult {
  matches: QuestionMatch[];
  totalQuestions: number;
  reasoning: string;
  isCorrelationQuery?: boolean; // New: flag for correlation queries
  topicsFound?: string[]; // New: track which topics were found
}

export class LightweightQuestionMatcher {
  
  /**
   * Enhanced approach: Detect correlation queries and ensure multi-topic coverage
   */
  async findRelevantQuestions(
    surveyId: number, 
    userQuery: string, 
    db: any,
    maxQuestions: number = 3
  ): Promise<MatchResult> {
    
    console.log(`🎯 Enhanced approach: Finding questions for "${userQuery}" in survey ${surveyId}`);
    
    // Step 1: Detect if this is a correlation query
    const isCorrelationQuery = this.detectCorrelationQuery(userQuery);
    
    // Step 2: Get simple list of questions (no analysis, just basic info)
    const [allQuestions] = await db.execute(`
      SELECT 
        id,
        prompt,
        type,
        question_order
      FROM survey_questions 
      WHERE survey_id = ? 
      ORDER BY question_order ASC
    `, [surveyId]);

    console.log(`📋 Found ${allQuestions.length} questions in survey`);
    console.log(`🔗 Correlation query detected: ${isCorrelationQuery}`);
    
    // Step 3: Filter out obvious non-matches first (metadata and text questions)
    const candidateQuestions = allQuestions.filter((q: any) => 
      !this.isMetadataQuestion(q.prompt) && !this.isOpenEndedText(q.type)
    );
    
    // Step 4: Use enhanced LLM scoring that handles correlation queries
    const scoredQuestions = await this.scoreQuestionsWithEnhancedLLM(
      candidateQuestions, 
      userQuery, 
      isCorrelationQuery
    );
    
    // Step 5: Smart selection based on query type
    let topMatches: QuestionMatch[];
    let topicsFound: string[] = [];
    
    if (isCorrelationQuery) {
      // For correlation queries, increase question limit to ensure multi-topic coverage
      const correlationMaxQuestions = Math.max(maxQuestions, 6); // Minimum 6 for correlation
      console.log(`🔗 Correlation mode: Expanding question limit from ${maxQuestions} to ${correlationMaxQuestions} for multi-topic coverage`);
      
      const result = this.selectCorrelationQuestions(scoredQuestions, correlationMaxQuestions);
      topMatches = result.matches;
      topicsFound = result.topicsFound;
      
      console.log(`🔗 Correlation analysis: Found questions from topics: ${topicsFound.join(', ')}`);
    } else {
      // Standard single-topic selection
      topMatches = scoredQuestions
        .filter(match => match.relevanceScore >= 60)
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
        .slice(0, maxQuestions);
    }
    
    console.log(`🎯 Top ${topMatches.length} relevant questions found:`);
    topMatches.forEach(match => {
      const topicLabel = match.topicCategory ? ` [${match.topicCategory}]` : '';
      console.log(`  📊 Score ${match.relevanceScore}${topicLabel}: ${match.question.prompt.substring(0, 100)}...`);
    });
    
    return {
      matches: topMatches,
      totalQuestions: allQuestions.length,
      reasoning: isCorrelationQuery 
        ? `Correlation query: Found ${topMatches.length} questions across ${topicsFound.length} topics: ${topicsFound.join(', ')}`
        : `Found ${topMatches.length} relevant questions out of ${allQuestions.length} total.`,
      isCorrelationQuery,
      topicsFound
    };
  }
  
  /**
   * Detect if the user query is asking for correlations/relationships between topics
   */
  private detectCorrelationQuery(userQuery: string): boolean {
    const correlationKeywords = [
      'correlation', 'correlate', 'relationship', 'between', 'and',
      'compare', 'versus', 'vs', 'relate', 'connection', 'link',
      'association', 'cross-analyze', 'cross-reference'
    ];
    
    const lowerQuery = userQuery.toLowerCase();
    const hasCorrelationKeywords = correlationKeywords.some(keyword => 
      lowerQuery.includes(keyword)
    );
    
    // Also check for pattern "X and Y" which often indicates correlation intent
    const hasAndPattern = lowerQuery.includes(' and ') && lowerQuery.split(' and ').length >= 2;
    
    return hasCorrelationKeywords || hasAndPattern;
  }
  
  /**
   * Enhanced LLM scoring that understands correlation queries and topic categorization
   */
  private async scoreQuestionsWithEnhancedLLM(
    questions: any[], 
    userQuery: string, 
    isCorrelationQuery: boolean
  ): Promise<QuestionMatch[]> {
    const questionsText = questions.map((q, index) => 
      `${index + 1}. [ID: ${q.id}] ${q.prompt}`
    ).join('\n\n');
    
    const basePrompt = `You are an expert at understanding survey questions and user intent.

USER QUERY: "${userQuery}"

SURVEY QUESTIONS:
${questionsText}`;

    const correlationPrompt = isCorrelationQuery ? `

🔗 CORRELATION ANALYSIS MODE:
This query asks for relationships between MULTIPLE topics. Your task:

1. IDENTIFY ALL TOPICS mentioned in the user query (e.g., "healthcare", "media", "military", etc.)
2. For each question, determine which topic(s) it relates to
3. Score questions highly if they relate to ANY of the topics mentioned
4. Assign a "topicCategory" to help group questions by theme

For correlation analysis, we need questions from ALL relevant topics, not just the most prominent one.` : '';

    const prompt = basePrompt + correlationPrompt + `

Your task: Score each question (1-100) based on how well it would help answer the user's query. Consider:

1. SEMANTIC RELEVANCE: Does the question content relate to what the user is asking about?
2. CONCEPTUAL OVERLAP: Are there related concepts even if exact words don't match?
3. DATA UTILITY: Would this question's answers help address the user's query?
${isCorrelationQuery ? '4. MULTI-TOPIC COVERAGE: For correlation queries, include questions from ALL mentioned topics' : ''}

Examples:
- "healthcare and media correlation" should score BOTH healthcare questions AND media questions highly
- "military vs entertainment" should include both military AND entertainment questions
- "social media influence" should score social media questions highly

Return ONLY a JSON array with this exact format:
[
  {"id": 123, "score": 85, "reasoning": "Healthcare question - directly relevant for correlation analysis", "topicCategory": "healthcare"},
  {"id": 124, "score": 80, "reasoning": "Social media question - other half of correlation query", "topicCategory": "media"}
]

Score generously for semantic relevance to ANY topic mentioned in the query.`;

    try {
      const completion = await createCompletion({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'user', content: prompt }
        ],
        temperature: 0.1,
        maxTokens: 3000 // Increased for correlation analysis
      });

      const responseText = completion.content || '';
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      
      if (!jsonMatch) {
        console.warn('⚠️ LLM response format invalid, falling back to basic scoring');
        return this.fallbackScoring(questions, userQuery);
      }

      const llmScores = JSON.parse(jsonMatch[0]);
      
      // Map LLM scores back to our question format
      const scoredQuestions: QuestionMatch[] = questions.map(q => {
        const llmScore = llmScores.find((score: any) => score.id === q.id);
        
        return {
          question: {
            id: q.id,
            prompt: q.prompt,
            type: q.type,
            question_order: q.question_order
          } as SimpleQuestion,
          relevanceScore: llmScore ? llmScore.score : 0,
          reasoning: llmScore ? llmScore.reasoning : 'No LLM scoring available',
          topicCategory: llmScore ? llmScore.topicCategory : undefined
        };
      });

      return scoredQuestions;

    } catch (error) {
      console.error('❌ LLM scoring failed:', error);
      return this.fallbackScoring(questions, userQuery);
    }
  }
  
  /**
   * Smart selection for correlation queries - ensure multi-topic coverage
   */
  private selectCorrelationQuestions(
    scoredQuestions: QuestionMatch[], 
    maxQuestions: number
  ): { matches: QuestionMatch[], topicsFound: string[] } {
    
    // Filter questions with decent scores
    const relevantQuestions = scoredQuestions.filter(match => match.relevanceScore >= 50);
    
    // Group by topic category
    const topicGroups: { [topic: string]: QuestionMatch[] } = {};
    relevantQuestions.forEach(match => {
      const topic = match.topicCategory || 'uncategorized';
      if (!topicGroups[topic]) {
        topicGroups[topic] = [];
      }
      topicGroups[topic].push(match);
    });
    
    // Sort each group by relevance score
    Object.keys(topicGroups).forEach(topic => {
      topicGroups[topic].sort((a, b) => b.relevanceScore - a.relevanceScore);
    });
    
    const topicsFound = Object.keys(topicGroups).filter(topic => topic !== 'uncategorized');
    
    // Select questions ensuring balanced representation from each topic
    const selectedQuestions: QuestionMatch[] = [];
    
    if (topicsFound.length >= 2) {
      // For correlation queries with multiple topics, ensure 2-3 questions per topic
      const questionsPerTopic = Math.max(2, Math.floor(maxQuestions / topicsFound.length));
      
      console.log(`🎯 Correlation balance: ${questionsPerTopic} questions per topic from ${topicsFound.length} topics`);
      
      // Get balanced selection from each topic
      topicsFound.forEach(topic => {
        const topQuestions = topicGroups[topic].slice(0, questionsPerTopic);
        selectedQuestions.push(...topQuestions);
        console.log(`  📊 Selected ${topQuestions.length} questions from ${topic} topic`);
      });
    } else {
      // Fallback for single topic
      const questionsPerTopic = Math.max(1, Math.floor(maxQuestions / Math.max(topicsFound.length, 1)));
      topicsFound.forEach(topic => {
        const topQuestions = topicGroups[topic].slice(0, questionsPerTopic);
        selectedQuestions.push(...topQuestions);
      });
    }
    
    // Fill remaining slots with highest-scoring questions from any topic
    const remainingSlots = maxQuestions - selectedQuestions.length;
    if (remainingSlots > 0) {
      const allRemaining = relevantQuestions
        .filter(q => !selectedQuestions.some(selected => selected.question.id === q.question.id))
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
        .slice(0, remainingSlots);
      
      selectedQuestions.push(...allRemaining);
    }
    
    return {
      matches: selectedQuestions.slice(0, maxQuestions),
      topicsFound
    };
  }
  
  /**
   * Fallback scoring in case LLM fails - improved keyword matching
   */
  private fallbackScoring(questions: any[], userQuery: string): QuestionMatch[] {
    return questions.map(q => {
      const score = this.basicRelevanceScore(q.prompt, q.type, userQuery);
      return {
        question: {
          id: q.id,
          prompt: q.prompt,
          type: q.type,
          question_order: q.question_order
        } as SimpleQuestion,
        relevanceScore: score.score,
        reasoning: score.reasoning
      };
    });
  }
  
  /**
   * Enhanced basic scoring as fallback - better keyword detection
   */
  private basicRelevanceScore(questionText: string, questionType: string, userQuery: string): { score: number, reasoning: string } {
    const lowerQuestion = questionText.toLowerCase();
    const lowerQuery = userQuery.toLowerCase();
    
    let score = 0;
    const reasons: string[] = [];
    
    // Base score for structured questions
    if (['single-choice', 'multiple-choice', 'rating', 'yes-no'].includes(questionType)) {
      score += 10;
      reasons.push('structured question type');
    }
    
    // Device/technology scoring
    if (lowerQuery.includes('device') || lowerQuery.includes('using') || lowerQuery.includes('phone') || 
        lowerQuery.includes('computer') || lowerQuery.includes('tablet')) {
      if (lowerQuestion.includes('device') || lowerQuestion.includes('access') || 
          lowerQuestion.includes('smartphone') || lowerQuestion.includes('laptop') || 
          lowerQuestion.includes('tablet') || lowerQuestion.includes('computer')) {
        score += 70;
        reasons.push('device/technology match');
      }
    }
    
    // Healthcare scoring
    if (lowerQuery.includes('healthcare') || lowerQuery.includes('health')) {
      if (lowerQuestion.includes('healthcare') || lowerQuestion.includes('health')) {
        score += 70;
        reasons.push('healthcare keyword match');
      }
    }
    
    // Military/defense scoring
    if (lowerQuery.includes('military') || lowerQuery.includes('defense')) {
      if (lowerQuestion.includes('military') || lowerQuestion.includes('defense')) {
        score += 70;
        reasons.push('military keyword match');
      }
    }
    
    // System/government topics
    if (lowerQuery.includes('system')) {
      if (lowerQuestion.includes('system')) {
        score += 50;
        reasons.push('system keyword match');
      }
    }
    
    // US/America references  
    if (lowerQuery.includes('us ') || lowerQuery.includes('america') || lowerQuery.includes('united states')) {
      if (lowerQuestion.includes('u.s.') || lowerQuestion.includes('america') || lowerQuestion.includes('united states')) {
        score += 40;
        reasons.push('US/America reference');
      }
    }
    
    // Opinion/comparison questions
    if (lowerQuery.includes('think') || lowerQuery.includes('opinion') || lowerQuery.includes('view')) {
      if (lowerQuestion.includes('compare') || lowerQuestion.includes('how') || lowerQuestion.includes('rate')) {
        score += 35;
        reasons.push('opinion/comparison question');
      }
    }
    
    // General semantic overlap
    const queryWords = lowerQuery.split(' ').filter(w => w.length > 3);
    const questionWords = lowerQuestion.split(' ').filter(w => w.length > 3);
    const commonWords = queryWords.filter(qw => questionWords.some(qnw => qnw.includes(qw) || qw.includes(qnw)));
    
    if (commonWords.length > 0) {
      score += commonWords.length * 10;
      reasons.push(`${commonWords.length} keyword matches`);
    }
    
    return {
      score: Math.max(0, score),
      reasoning: reasons.join(', ') || 'no strong matches'
    };
  }

  /**
   * Check if this is a metadata/administrative question
   */
  private isMetadataQuestion(prompt: string): boolean {
    const metadataPatterns = [
      'unique id', 'respondent id', 'timestamp', 'start time', 'end time',
      'duration', 'ip address', 'user agent', 'session', 'completion',
      'form assignment', 'wave assignment', 'language of interview',
      'browser', 'operating system', 'screen resolution', 'referrer'
    ];
    
    const lowerPrompt = prompt.toLowerCase();
    
    // Special case: "device used" questions are valuable for user queries, not pure metadata
    if (lowerPrompt.includes('device') && (lowerPrompt.includes('access') || lowerPrompt.includes('survey'))) {
      return false; // Don't exclude device usage questions
    }
    
    return metadataPatterns.some(pattern => lowerPrompt.includes(pattern));
  }

  /**
   * Check if this is an open-ended text question
   */
  private isOpenEndedText(questionType: string): boolean {
    return questionType === 'text';
  }
  
  /**
   * Generate targeted SQL query for a specific question
   */
  async generateTargetedQuery(questionId: number, surveyId: number, db: any): Promise<any> {
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
      LIMIT 15
    `, [questionId, surveyId, questionId, surveyId]);

    return responses;
  }
} 