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
  demographicFilter?: {
    field: string;
    value: string;
    questionId: number | null;
  } | null;
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
    
    // Step 1: Detect demographic filter requirements
    const demographicFilter = this.detectDemographicFilter(userQuery);
    console.log(`🎯 [DEBUG] Demographic filter:`, demographicFilter);
    
    // Step 2: Find demographic question if filter is needed
    let demographicQuestionId: number | null = null;
    if (demographicFilter.found) {
      demographicQuestionId = await this.findDemographicQuestion(demographicFilter.field, surveyId, db);
      if (demographicQuestionId) {
        console.log(`🎯 [DEBUG] Will use demographic question ${demographicQuestionId} to filter by ${demographicFilter.field}=${demographicFilter.value}`);
      } else {
        console.log(`🎯 [DEBUG] No demographic question found, proceeding without demographic filtering`);
      }
    }
    
    // Step 3: Detect if this is a correlation query
    const isCorrelationQuery = this.detectCorrelationQuery(userQuery);
    
    // Step 4: Get simple list of questions (no analysis, just basic info)
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
    
    // Step 5: Filter out obvious non-matches first (metadata and text questions)
    const candidateQuestions = allQuestions.filter((q: any) => 
      !this.isMetadataQuestion(q.prompt) && !this.isOpenEndedText(q.type)
    );
    
    // Step 6: Use enhanced LLM scoring that handles correlation queries
    const scoredQuestions = await this.scoreQuestionsWithEnhancedLLM(
      candidateQuestions, 
      userQuery, 
      isCorrelationQuery
    );
    
    // Step 7: Smart selection based on query type
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
      topicsFound,
      demographicFilter: demographicFilter.found ? {
        field: demographicFilter.field,
        value: demographicFilter.value,
        questionId: demographicQuestionId
      } : null
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
   * Find the demographic question in the survey that matches the filter field
   */
  private async findDemographicQuestion(field: string, surveyId: number, db: any): Promise<number | null> {
    try {
      // Map demographic fields to question patterns
      const questionPatterns = {
        'gender': ['gender', 'sex', 'male', 'female'],
        'age': ['age', 'birth', 'old', 'young'],
        'education': ['education', 'school', 'degree', 'college']
      };
      
      const patterns = questionPatterns[field as keyof typeof questionPatterns];
      if (!patterns) return null;
      
      // Get all questions for this survey
      const [questions] = await db.execute(
        `SELECT id, prompt FROM survey_questions WHERE survey_id = ?`,
        [surveyId]
      ) as any[];
      
      // Find question that matches demographic field
      for (const question of questions) {
        const lowerPrompt = question.prompt.toLowerCase();
        
        for (const pattern of patterns) {
          if (lowerPrompt.includes(pattern)) {
            console.log(`🎯 [DEBUG] Found demographic question for ${field}: ID ${question.id} - "${question.prompt}"`);
            return question.id;
          }
        }
      }
      
      console.log(`🎯 [DEBUG] No demographic question found for field: ${field}`);
      return null;
      
    } catch (error) {
      console.error('Error finding demographic question:', error);
      return null;
    }
  }

  /**
   * Detect if the user query contains demographic filters that should be applied
   */
  private detectDemographicFilter(userQuery: string): { field: string; value: string; questionId?: number; found: boolean } {
    const lowerQuery = userQuery.toLowerCase();
    
    // Gender detection
    const genderPatterns = {
      'female': ['women', 'woman', 'female', 'females'],
      'male': ['men', 'man', 'male', 'males'],
      'non-binary': ['non-binary', 'nonbinary', 'non binary']
    };
    
    for (const [genderValue, patterns] of Object.entries(genderPatterns)) {
      for (const pattern of patterns) {
        if (lowerQuery.includes(pattern)) {
          console.log(`🎯 [DEBUG] Detected gender filter: ${genderValue} (from "${pattern}")`);
          return { field: 'gender', value: genderValue, found: true };
        }
      }
    }
    
    // Age detection  
    const agePatterns = {
      'young': ['young', 'youth', 'under 30', 'millennials', 'gen z'],
      'old': ['old', 'older', 'seniors', 'elderly', 'over 60'],
      'middle': ['middle aged', 'middle-aged', '30-50', 'gen x']
    };
    
    for (const [ageValue, patterns] of Object.entries(agePatterns)) {
      for (const pattern of patterns) {
        if (lowerQuery.includes(pattern)) {
          console.log(`🎯 [DEBUG] Detected age filter: ${ageValue} (from "${pattern}")`);
          return { field: 'age', value: ageValue, found: true };
        }
      }
    }
    
    // Education detection
    const educationPatterns = {
      'college': ['college', 'university', 'graduates', 'degree holders'],
      'high school': ['high school', 'secondary', 'no college'],
      'advanced': ['phd', 'masters', 'graduate degree', 'advanced degree']
    };
    
    for (const [eduValue, patterns] of Object.entries(educationPatterns)) {
      for (const pattern of patterns) {
        if (lowerQuery.includes(pattern)) {
          console.log(`🎯 [DEBUG] Detected education filter: ${eduValue} (from "${pattern}")`);
          return { field: 'education', value: eduValue, found: true };
        }
      }
    }
    
    console.log(`🎯 [DEBUG] No demographic filter detected in query: "${userQuery}"`);
    return { field: '', value: '', found: false };
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
   * Generate a targeted SQL query for a specific question and survey
   */
  async generateTargetedQuery(questionId: number, surveyId: number, db: any): Promise<any> {
    console.log(`🔍 [DEBUG] generateTargetedQuery called with questionId=${questionId}, surveyId=${surveyId}`);
    
    // First get the question type to determine how to handle the data
    const [questionInfo] = await db.execute(`
      SELECT type FROM survey_questions WHERE id = ?
    `, [questionId]) as any[];

    const questionType = questionInfo[0]?.type;
    console.log(`🔍 [DEBUG] Question ${questionId} type: ${questionType}`);

    // Handle multiple choice questions differently - parse JSON arrays
    if (questionType === 'multiple-choice') {
      return this.generateMultipleChoiceQuery(questionId, surveyId, db);
    }

    // For yes-no questions, use UNION to properly combine answer_value and answer_code with survey filtering
    let sql;
    let params;

    if (questionType === 'yes-no') {
      // CRITICAL FIX: Use UNION to prevent survey_id filter from being bypassed
      sql = `
        SELECT 
          answer_value,
          COUNT(*) as count,
          ROUND((COUNT(*) * 100.0 / (
            SELECT COUNT(*) 
            FROM survey_answers sa2 
            JOIN survey_responses sr2 ON sa2.response_id = sr2.id 
            WHERE sa2.question_id = ? AND sr2.survey_id = ?
          )), 1) as percentage
        FROM (
          SELECT sa.answer_value as answer_value
          FROM survey_answers sa
          JOIN survey_responses sr ON sa.response_id = sr.id
          WHERE sa.question_id = ? 
          AND sr.survey_id = ?
          AND sa.answer_value IS NOT NULL AND sa.answer_value != ''
          
          UNION ALL
          
          SELECT sa.answer_code as answer_value
          FROM survey_answers sa
          JOIN survey_responses sr ON sa.response_id = sr.id
          WHERE sa.question_id = ? 
          AND sr.survey_id = ?
          AND (sa.answer_value IS NULL OR sa.answer_value = '')
          AND sa.answer_code IS NOT NULL AND sa.answer_code != '' AND sa.answer_code != 'null'
        ) combined_results
        GROUP BY answer_value
        ORDER BY count DESC
        LIMIT 15
      `;
      params = [questionId, surveyId, questionId, surveyId, questionId, surveyId];
    } else {
      // For other question types, use simple query
      sql = `
        SELECT 
          sa.answer_value as answer_value,
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
        AND sa.answer_value IS NOT NULL AND sa.answer_value != ''
        GROUP BY sa.answer_value
        ORDER BY count DESC
        LIMIT 15
      `;
      params = [questionId, surveyId, questionId, surveyId];
    }
    console.log(`🔍 [DEBUG] Executing SQL for Q${questionId} in Survey${surveyId}:`);
    console.log(`🔍 [DEBUG] SQL: ${sql.replace(/\s+/g, ' ').trim()}`);
    console.log(`🔍 [DEBUG] Params: ${JSON.stringify(params)}`);

    const [responses] = await db.execute(sql, params);
    
    console.log(`📊 [DEBUG] Question ${questionId} (${questionType}): Found ${responses.length} answer groups`);
    console.log(`📊 [DEBUG] Raw results for Q${questionId}:`, JSON.stringify(responses, null, 2));
    
    const totalResponses = responses.reduce((sum: number, row: any) => sum + (row.count || 0), 0);
    console.log(`📊 [DEBUG] Total response count for Q${questionId}: ${totalResponses}`);
    
    return responses;
  }

  /**
   * Handle multiple choice questions by parsing JSON arrays and counting individual options
   */
  private async generateMultipleChoiceQuery(questionId: number, surveyId: number, db: any): Promise<any> {
    console.log(`🔍 [DEBUG] Processing multiple choice question ${questionId}`);

    // Get all raw answer values for this question
    const [rawAnswers] = await db.execute(`
      SELECT sa.answer_value
      FROM survey_answers sa
      JOIN survey_responses sr ON sa.response_id = sr.id
      WHERE sa.question_id = ? 
      AND sr.survey_id = ?
      AND sa.answer_value IS NOT NULL 
      AND sa.answer_value != ''
    `, [questionId, surveyId]);

    console.log(`🔍 [DEBUG] Retrieved ${rawAnswers.length} raw answers for multiple choice Q${questionId}`);

    // Parse JSON arrays and count individual options
    const optionCounts: { [option: string]: number } = {};
    let totalValidResponses = 0;

    for (const row of rawAnswers as any[]) {
      try {
        // Parse the JSON array of selected options
        const selectedOptions = JSON.parse(row.answer_value);
        
        if (Array.isArray(selectedOptions)) {
          totalValidResponses++;
          
          // Count each selected option
          for (const option of selectedOptions) {
            if (typeof option === 'string' && option.trim() !== '') {
              const cleanOption = option.trim();
              optionCounts[cleanOption] = (optionCounts[cleanOption] || 0) + 1;
            }
          }
        }
      } catch (error) {
        // Handle non-JSON responses (fallback for malformed data)
        console.warn(`⚠️ [DEBUG] Failed to parse JSON for answer: ${row.answer_value}`);
        
        // Try to treat as single option if it's not JSON
        if (row.answer_value && typeof row.answer_value === 'string') {
          const cleanOption = row.answer_value.trim();
          if (cleanOption !== '') {
            optionCounts[cleanOption] = (optionCounts[cleanOption] || 0) + 1;
            totalValidResponses++;
          }
        }
      }
    }

    // Convert to the expected format with percentages
    const results = Object.entries(optionCounts)
      .map(([option, count]) => ({
        answer_value: option,
        count: count,
        percentage: totalValidResponses > 0 ? 
          Math.round((count / totalValidResponses) * 1000) / 10 : 0 // Round to 1 decimal place
      }))
      .sort((a, b) => b.count - a.count); // Sort by count descending

    console.log(`📊 [DEBUG] Multiple choice Q${questionId} processed:`);
    console.log(`📊 [DEBUG] Total valid responses: ${totalValidResponses}`);
    console.log(`📊 [DEBUG] Unique options found: ${Object.keys(optionCounts).length}`);
    console.log(`📊 [DEBUG] Option breakdown:`, JSON.stringify(results, null, 2));

    return results;
  }

  /**
   * Generate a targeted SQL query with optional demographic filtering
   */
  async generateTargetedQueryWithFilter(
    questionId: number, 
    surveyId: number, 
    db: any,
    demographicFilter?: { field: string; value: string; questionId: number | null } | null
  ): Promise<any> {
    console.log(`🔍 [DEBUG] generateTargetedQueryWithFilter called with questionId=${questionId}, surveyId=${surveyId}`);
    console.log(`🔍 [DEBUG] Demographic filter:`, demographicFilter);
    
    // If no demographic filter, use the original method
    if (!demographicFilter || !demographicFilter.questionId) {
      return this.generateTargetedQuery(questionId, surveyId, db);
    }
    
    // First get the question type to determine how to handle the data
    const [questionInfo] = await db.execute(`
      SELECT type FROM survey_questions WHERE id = ?
    `, [questionId]) as any[];

    const questionType = questionInfo[0]?.type;
    console.log(`🔍 [DEBUG] Question ${questionId} type: ${questionType}`);

    // Handle multiple choice questions differently - parse JSON arrays
    if (questionType === 'multiple-choice') {
      return this.generateMultipleChoiceQueryWithFilter(questionId, surveyId, db, demographicFilter);
    }

    // For filtered queries, we need to join with the demographic question
    let sql;
    let params;

    if (questionType === 'yes-no') {
      // UNION approach with demographic filtering
      sql = `
        SELECT 
          answer_value,
          COUNT(*) as count,
          ROUND((COUNT(*) * 100.0 / (
            SELECT COUNT(*) 
            FROM survey_answers sa2 
            JOIN survey_responses sr2 ON sa2.response_id = sr2.id 
            JOIN survey_answers sa_demo2 ON sr2.id = sa_demo2.response_id
            WHERE sa2.question_id = ? AND sr2.survey_id = ?
            AND sa_demo2.question_id = ? AND sa_demo2.answer_value = ?
          )), 1) as percentage
        FROM (
          SELECT sa.answer_value as answer_value
          FROM survey_answers sa
          JOIN survey_responses sr ON sa.response_id = sr.id
          JOIN survey_answers sa_demo ON sr.id = sa_demo.response_id
          WHERE sa.question_id = ? 
          AND sr.survey_id = ?
          AND sa_demo.question_id = ? AND sa_demo.answer_value = ?
          AND sa.answer_value IS NOT NULL AND sa.answer_value != ''
          
          UNION ALL
          
          SELECT sa.answer_code as answer_value
          FROM survey_answers sa
          JOIN survey_responses sr ON sa.response_id = sr.id
          JOIN survey_answers sa_demo ON sr.id = sa_demo.response_id
          WHERE sa.question_id = ? 
          AND sr.survey_id = ?
          AND sa_demo.question_id = ? AND sa_demo.answer_value = ?
          AND (sa.answer_value IS NULL OR sa.answer_value = '')
          AND sa.answer_code IS NOT NULL AND sa.answer_code != '' AND sa.answer_code != 'null'
        ) combined_results
        GROUP BY answer_value
        ORDER BY count DESC
        LIMIT 15
      `;
      params = [
        questionId, surveyId, demographicFilter.questionId, demographicFilter.value, // For percentage calculation
        questionId, surveyId, demographicFilter.questionId, demographicFilter.value, // For answer_value part
        questionId, surveyId, demographicFilter.questionId, demographicFilter.value  // For answer_code part
      ];
    } else {
      // For other question types with demographic filtering
      sql = `
        SELECT 
          sa.answer_value as answer_value,
          COUNT(*) as count,
          ROUND((COUNT(*) * 100.0 / (
            SELECT COUNT(*) 
            FROM survey_answers sa2 
            JOIN survey_responses sr2 ON sa2.response_id = sr2.id 
            JOIN survey_answers sa_demo2 ON sr2.id = sa_demo2.response_id
            WHERE sa2.question_id = ? AND sr2.survey_id = ?
            AND sa_demo2.question_id = ? AND sa_demo2.answer_value = ?
          )), 1) as percentage
        FROM survey_answers sa
        JOIN survey_responses sr ON sa.response_id = sr.id
        JOIN survey_answers sa_demo ON sr.id = sa_demo.response_id
        WHERE sa.question_id = ? 
        AND sr.survey_id = ?
        AND sa_demo.question_id = ? AND sa_demo.answer_value = ?
        AND sa.answer_value IS NOT NULL AND sa.answer_value != ''
        GROUP BY sa.answer_value
        ORDER BY count DESC
        LIMIT 15
      `;
      params = [
        questionId, surveyId, demographicFilter.questionId, demographicFilter.value, // For percentage calculation
        questionId, surveyId, demographicFilter.questionId, demographicFilter.value  // For main query
      ];
    }
    
    console.log(`🔍 [DEBUG] Executing FILTERED SQL for Q${questionId} in Survey${surveyId} (${demographicFilter.field}=${demographicFilter.value}):`);
    console.log(`🔍 [DEBUG] SQL: ${sql.replace(/\s+/g, ' ').trim()}`);
    console.log(`🔍 [DEBUG] Params: ${JSON.stringify(params)}`);

    const [responses] = await db.execute(sql, params);
    
    console.log(`📊 [DEBUG] Question ${questionId} (${questionType}) with ${demographicFilter.field} filter: Found ${responses.length} answer groups`);
    console.log(`📊 [DEBUG] Raw filtered results for Q${questionId}:`, JSON.stringify(responses, null, 2));
    
    const totalResponses = responses.reduce((sum: number, row: any) => sum + (row.count || 0), 0);
    console.log(`📊 [DEBUG] Total filtered response count for Q${questionId}: ${totalResponses}`);
    
    return responses;
  }

  /**
   * Handle multiple choice questions with demographic filtering
   */
  private async generateMultipleChoiceQueryWithFilter(
    questionId: number, 
    surveyId: number, 
    db: any,
    demographicFilter: { field: string; value: string; questionId: number | null }
  ): Promise<any> {
    console.log(`🔍 [DEBUG] Processing multiple choice question ${questionId} with ${demographicFilter.field} filter`);

    // Get all raw answer values for this question with demographic filtering
    const [rawAnswers] = await db.execute(`
      SELECT sa.answer_value
      FROM survey_answers sa
      JOIN survey_responses sr ON sa.response_id = sr.id
      JOIN survey_answers sa_demo ON sr.id = sa_demo.response_id
      WHERE sa.question_id = ? 
      AND sr.survey_id = ?
      AND sa_demo.question_id = ? AND sa_demo.answer_value = ?
      AND sa.answer_value IS NOT NULL 
      AND sa.answer_value != ''
    `, [questionId, surveyId, demographicFilter.questionId, demographicFilter.value]);

    console.log(`🔍 [DEBUG] Retrieved ${rawAnswers.length} raw answers for filtered multiple choice Q${questionId}`);

    // Parse JSON arrays and count individual options (same logic as before)
    const optionCounts: { [option: string]: number } = {};
    let totalValidResponses = 0;

    for (const row of rawAnswers as any[]) {
      try {
        const selectedOptions = JSON.parse(row.answer_value);
        
        if (Array.isArray(selectedOptions)) {
          totalValidResponses++;
          
          for (const option of selectedOptions) {
            if (typeof option === 'string' && option.trim() !== '') {
              const cleanOption = option.trim();
              optionCounts[cleanOption] = (optionCounts[cleanOption] || 0) + 1;
            }
          }
        }
      } catch (error) {
        console.warn(`⚠️ [DEBUG] Failed to parse JSON for answer: ${row.answer_value}`);
        
        if (row.answer_value && typeof row.answer_value === 'string') {
          const cleanOption = row.answer_value.trim();
          if (cleanOption !== '') {
            optionCounts[cleanOption] = (optionCounts[cleanOption] || 0) + 1;
            totalValidResponses++;
          }
        }
      }
    }

    // Convert to the expected format with percentages
    const results = Object.entries(optionCounts)
      .map(([option, count]) => ({
        answer_value: option,
        count: count,
        percentage: totalValidResponses > 0 ? 
          Math.round((count / totalValidResponses) * 1000) / 10 : 0
      }))
      .sort((a, b) => b.count - a.count);

    console.log(`📊 [DEBUG] Filtered multiple choice Q${questionId} processed:`);
    console.log(`📊 [DEBUG] Total filtered valid responses: ${totalValidResponses}`);
    console.log(`📊 [DEBUG] Unique options found: ${Object.keys(optionCounts).length}`);
    console.log(`📊 [DEBUG] Filtered option breakdown:`, JSON.stringify(results, null, 2));

    return results;
  }
}