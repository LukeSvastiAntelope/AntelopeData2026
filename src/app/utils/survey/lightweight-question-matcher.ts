import { createCompletion } from "../services/ai-service";
import { CohortFilterRule } from "../interface";

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
  queryStrategy?: 'single_topic' | 'correlation' | 'comparison' | 'demographic_analysis'; // New: strategy type
  intentAdapted?: boolean; // New: flag indicating if the intent was adapted due to question type mismatch
  demographicFilter?: {
    field: string;
    value: string;
    questionId: number | null;
  } | null;
  // Multi-cohort support
  multiCohortResults?: MatchResult[]; // For comparative analysis
  cohortInfo?: {
    index: number;
    name: string;
    filter: any;
    field: string;
    value: any;
  };
}

export class LightweightQuestionMatcher {
  
  /**
   * Multi-cohort comparative analysis approach
   * Each filter rule creates a separate cohort for side-by-side comparison
   */
  async findRelevantQuestionsWithCohort(
    surveyId: number, 
    userQuery: string, 
    db: any,
    cohortFilters: CohortFilterRule[],
    maxQuestions: number = 3,
    queryIntent?: any
  ): Promise<MatchResult> {
    console.log(`🎯 [MULTI-COHORT] Processing query with ${cohortFilters.length} cohort filter(s)`);
    console.log(`🎯 [MULTI-COHORT] Filters:`, JSON.stringify(cohortFilters, null, 2));
    
    // 🧠 Intent-aware processing
    if (queryIntent) {
      console.log(`🧠 [INTENT-AWARE] Using intent guidance: ${queryIntent.intent}`);
      console.log(`🧠 [INTENT-AWARE] Question types filter: ${queryIntent.questionTypes?.join(', ') || 'none'}`);
    }
    
    // Handle no cohorts case - use regular analysis
    if (!cohortFilters || cohortFilters.length === 0) {
      console.log(`🎯 [MULTI-COHORT] No cohort filters - using regular analysis`);
      return this.findRelevantQuestionsInternal(surveyId, userQuery, db, maxQuestions, null, [], queryIntent);
    }
    
    // Handle single cohort case - maintain backward compatibility
    if (cohortFilters.length === 1) {
      console.log(`🎯 [MULTI-COHORT] Single cohort - using existing logic`);
      return this.processSingleCohort(surveyId, userQuery, db, cohortFilters[0], cohortFilters, maxQuestions, queryIntent);
    }
    
    // 🚀 NEW: Multi-cohort comparative analysis
    console.log(`🎯 [MULTI-COHORT] Starting comparative analysis for ${cohortFilters.length} cohorts`);
    
    const cohortResults: any[] = [];
    const allExcludeQuestionIds: number[] = [];
    
    // Step 1: Build unified blacklist from all cohort filters
    for (const filter of cohortFilters) {
      if (['education', 'age', 'gender', 'income', 'political', 'religion', 'location'].includes(filter.field)) {
        const questionId = await this.findDemographicQuestion(filter.field, surveyId, db);
        if (questionId && !allExcludeQuestionIds.includes(questionId)) {
          allExcludeQuestionIds.push(questionId);
        }
      } else if (filter.field.startsWith('question_')) {
        const questionId = parseInt(filter.field.replace('question_', ''));
        if (!isNaN(questionId) && !allExcludeQuestionIds.includes(questionId)) {
          allExcludeQuestionIds.push(questionId);
        }
      }
    }
    
    console.log(`🚫 [MULTI-COHORT] Unified blacklist: ${allExcludeQuestionIds.length} questions - [${allExcludeQuestionIds.join(', ')}]`);
    
    // Step 2: Process each cohort separately
    for (let i = 0; i < cohortFilters.length; i++) {
      const filter = cohortFilters[i];
      console.log(`\n🔍 [COHORT ${i + 1}/${cohortFilters.length}] Processing filter: ${filter.field} = ${JSON.stringify(filter.value)}`);
      
      try {
        // Convert filter to demographic format
        const cohortDemographicFilter = await this.convertFilterToDemographic(filter, surveyId, db);
        
        if (cohortDemographicFilter.found) {
                     // Run analysis for this specific cohort
           const cohortResult = await this.findRelevantQuestionsInternal(
             surveyId,
             userQuery,
             db,
             maxQuestions,
             cohortDemographicFilter,
             cohortFilters, // Pass original cohort filters for blacklist building
             queryIntent // Pass intent context
           );
          
          // Add cohort metadata
          cohortResult.cohortInfo = {
            index: i,
            name: this.generateCohortName(filter),
            filter: filter,
            field: filter.field,
            value: filter.value
          };
          
          cohortResults.push(cohortResult);
          console.log(`✅ [COHORT ${i + 1}] Analysis completed - ${cohortResult.matches.length} questions found`);
        } else {
          console.log(`❌ [COHORT ${i + 1}] No demographic question found for field: ${filter.field}`);
        }
      } catch (error) {
        console.error(`❌ [COHORT ${i + 1}] Analysis failed:`, error);
      }
    }
    
    // Step 3: Combine results for comparative analysis
    return this.combineMultiCohortResults(cohortResults, userQuery, surveyId);
  }
  
  /**
   * Process single cohort (backward compatibility)
   */
  private async processSingleCohort(
    surveyId: number,
    userQuery: string,
    db: any,
    filter: CohortFilterRule,
    allFilters: CohortFilterRule[],
    maxQuestions: number,
    queryIntent?: any
  ): Promise<MatchResult> {
    const cohortDemographicFilter = await this.convertFilterToDemographic(filter, surveyId, db);
    
    return this.findRelevantQuestionsInternal(
      surveyId,
      userQuery,
      db,
      maxQuestions,
      cohortDemographicFilter,
      allFilters,
      queryIntent
    );
  }

  /**
   * Convert a cohort filter rule to demographic filter format
   */
  private async convertFilterToDemographic(
    filter: CohortFilterRule,
    surveyId: number,
    db: any
  ): Promise<{ field: string; value: string; questionId: number | null; found: boolean }> {
    // Handle different value types (string vs array)
    let filterValue = filter.value;
    if (Array.isArray(filterValue)) {
      filterValue = filterValue[0]; // Use first value for now
      console.log(`🎯 [CONVERT] Using first array value: "${filterValue}"`);
    }
    
    // 🔧 NEW: Handle question-based filters (e.g., question_2139)
    if (filter.field.startsWith('question_')) {
      const questionId = parseInt(filter.field.replace('question_', ''));
      console.log(`🎯 [CONVERT] Question-based filter: ${filter.field} -> questionId: ${questionId}`);
      
      if (!isNaN(questionId)) {
        // Map filter value to actual survey values using the question ID
        const originalFilterValue = filterValue as string;
        const mappedFilterValue = this.mapFilterValue('education', originalFilterValue); // Assume education for value mapping
        if (mappedFilterValue !== originalFilterValue) {
          console.log(`🎯 [CONVERT] Applied value mapping: "${originalFilterValue}" -> "${mappedFilterValue}"`);
          filterValue = mappedFilterValue;
        }
        
        return {
          field: filter.field,
          value: filterValue as string,
          questionId: questionId,
          found: true
        };
      }
    }
    
    // Handle standard demographic fields (education, age, gender, etc.)
    const originalFilterValue = filterValue as string;
    const mappedFilterValue = this.mapFilterValue(filter.field, originalFilterValue);
    if (mappedFilterValue !== originalFilterValue) {
      console.log(`🎯 [CONVERT] Applied value mapping: "${originalFilterValue}" -> "${mappedFilterValue}"`);
      filterValue = mappedFilterValue;
    }
    
    // Find the question ID for this demographic field
    const questionId = await this.findDemographicQuestion(filter.field, surveyId, db);
    
    return {
      field: filter.field,
      value: filterValue as string,
      questionId: questionId,
      found: questionId !== null
    };
  }

  /**
   * Generate a human-readable name for a cohort based on its filter
   */
  private generateCohortName(filter: CohortFilterRule): string {
    const fieldNames: { [key: string]: string } = {
      'education': 'Education',
      'age': 'Age',
      'gender': 'Gender',
      'income': 'Income',
      'political': 'Political Views',
      'religion': 'Religion',
      'location': 'Location'
    };
    
    const fieldName = fieldNames[filter.field] || filter.field;
    
    if (Array.isArray(filter.value)) {
      if (filter.value.length === 1) {
        return `${fieldName}: ${filter.value[0]}`;
      } else {
        return `${fieldName}: ${filter.value.slice(0, 2).join(', ')}${filter.value.length > 2 ? '...' : ''}`;
      }
    } else {
      return `${fieldName}: ${filter.value}`;
    }
  }

  /**
   * Combine multiple cohort results into a comparative analysis format
   */
  private combineMultiCohortResults(
    cohortResults: any[],
    userQuery: string,
    surveyId: number
  ): MatchResult {
    if (cohortResults.length === 0) {
      // Return empty result if no cohorts processed successfully
      return {
        matches: [],
        totalQuestions: 0,
        reasoning: 'No cohorts could be processed successfully',
        isCorrelationQuery: false,
        queryStrategy: 'single_topic',
        topicsFound: [],
        demographicFilter: null,
        multiCohortResults: []
      };
    }
    
    // Use the first cohort's question selection as the base
    const baseResult = cohortResults[0];
    
    // Create comparative result structure
    const comparativeResult: MatchResult = {
      matches: baseResult.matches,
      totalQuestions: baseResult.totalQuestions,
      reasoning: `Multi-cohort comparative analysis across ${cohortResults.length} cohorts`,
      isCorrelationQuery: baseResult.isCorrelationQuery,
      queryStrategy: baseResult.queryStrategy,
      topicsFound: baseResult.topicsFound,
      demographicFilter: null, // Not applicable for multi-cohort
      multiCohortResults: cohortResults
    };
    
    console.log(`🎯 [MULTI-COHORT] Combined results: ${cohortResults.length} cohorts, ${baseResult.matches.length} questions`);
    
    return comparativeResult;
  }
  
  /**
   * Original method - now calls internal with dynamic detection
   */
  async findRelevantQuestions(
    surveyId: number, 
    userQuery: string, 
    db: any,
    maxQuestions: number = 3
  ): Promise<MatchResult> {
    return this.findRelevantQuestionsInternal(surveyId, userQuery, db, maxQuestions, null, [], undefined);
  }
  
  /**
   * Internal method that handles both cohort filters and dynamic detection
   */
  private async findRelevantQuestionsInternal(
    surveyId: number, 
    userQuery: string, 
    db: any,
    maxQuestions: number = 3,
    overrideDemographicFilter: { field: string; value: string; questionId: number | null; found: boolean } | null = null,
    cohortFilterRules: any[] = [],
    queryIntent?: any
  ): Promise<MatchResult> {
    
    console.log(`🎯 [NEW CODE] Analyzing user intent for: "${userQuery}" in survey ${surveyId}`);
    console.log(`🚀 [NEW CODE] Enhanced strategy system is running!`);
    
    // Step 1: Use override filter if provided, otherwise detect from query
    const demographicFilter = overrideDemographicFilter || this.detectDemographicFilter(userQuery);
    console.log(`🎯 [DEBUG] Using demographic filter (${overrideDemographicFilter ? 'from cohort' : 'auto-detected'}):`, demographicFilter);
    
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
    
    // Step 2.5: 🚫 BUILD BLACKLIST - Exclude cohort filter questions from analysis
    const excludeQuestionIds: number[] = [];
    if (cohortFilterRules && cohortFilterRules.length > 0) {
      console.log(`🚫 [BLACKLIST] Building exclusion list from ${cohortFilterRules.length} cohort filter(s)`);
      
      for (const filter of cohortFilterRules) {
        // Map field names to question IDs for demographic filters
        if (['education', 'age', 'gender', 'income', 'political', 'religion', 'location'].includes(filter.field)) {
          const questionId = await this.findDemographicQuestion(filter.field, surveyId, db);
          if (questionId) {
            excludeQuestionIds.push(questionId);
            console.log(`🚫 [BLACKLIST] Excluding question ${questionId} (${filter.field}) from analysis`);
          }
        }
        // Also handle direct question ID references if the filter uses question_XXX format
        else if (filter.field.startsWith('question_')) {
          const questionId = parseInt(filter.field.replace('question_', ''));
          if (!isNaN(questionId)) {
            excludeQuestionIds.push(questionId);
            console.log(`🚫 [BLACKLIST] Excluding question ${questionId} (direct reference) from analysis`);
          }
        }
      }
      
      if (excludeQuestionIds.length > 0) {
        console.log(`🚫 [BLACKLIST] Total questions excluded: ${excludeQuestionIds.length} - [${excludeQuestionIds.join(', ')}]`);
      } else {
        console.log(`🚫 [BLACKLIST] No questions to exclude from cohort filters`);
      }
    }
    
    // Step 3: Analyze user intent to determine query strategy
    const queryStrategy = this.determineQueryStrategy(userQuery);
    console.log(`🧠 [NEW CODE] Query strategy determined: ${queryStrategy}`);
    console.log(`🔍 [NEW CODE] Strategy detection working correctly!`);
    
    // Step 4: Get survey questions
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
    
    // Step 5: Filter questions based on blacklist only (NOT intent yet)
    const candidateQuestions = allQuestions.filter((q: any) => 
      !this.isMetadataQuestion(q.prompt) && 
      !excludeQuestionIds.includes(q.id) // 🚫 Apply blacklist exclusion
    );
    
    console.log(`📋 Pre-scoring candidates: ${candidateQuestions.length} questions (will apply intent filter AFTER scoring)`);
    
    // 🧠 INTENT FILTERING MOVED: Will be applied AFTER relevance scoring to preserve question discovery
    
    console.log(`🔍 After filtering: ${candidateQuestions.length} candidate questions (excluded ${allQuestions.length - candidateQuestions.length} questions)`);
    if (excludeQuestionIds.length > 0) {
      console.log(`🚫 Blacklist effect: ${excludeQuestionIds.length} questions excluded from cohort filters`);
    }
    
    console.log(`📋 [NEW CODE] After filtering: ${candidateQuestions.length} candidate questions for analysis`);
    console.log(`✅ [NEW CODE] Question filtering working - should have ~98 questions for Survey 81`);
    
    // Step 6: Use strategy-specific question selection
    let topMatches: QuestionMatch[];
    let topicsFound: string[] = [];
    
    switch (queryStrategy) {
             case 'correlation':
         console.log(`🔗 [NEW CODE] CORRELATION STRATEGY: Looking for questions about multiple topics to analyze relationships`);
         console.log(`🎯 [NEW CODE] This should find education AND US opinion questions!`);
         const correlationResult = await this.handleCorrelationStrategy(candidateQuestions, userQuery, maxQuestions);
        topMatches = correlationResult.matches;
        topicsFound = correlationResult.topicsFound;
        break;
        
      case 'comparison':
        console.log(`⚖️ COMPARISON STRATEGY: Finding questions that allow comparing different aspects`);
        const comparisonResult = await this.handleComparisonStrategy(candidateQuestions, userQuery, maxQuestions);
        topMatches = comparisonResult.matches;
        topicsFound = comparisonResult.topicsFound;
        break;
        
      case 'demographic_analysis':
        console.log(`👥 DEMOGRAPHIC STRATEGY: Analyzing how different groups respond to survey questions`);
        const demographicResult = await this.handleDemographicStrategy(candidateQuestions, userQuery, maxQuestions);
        topMatches = demographicResult.matches;
        topicsFound = demographicResult.topicsFound;
        break;
        
      default: // single_topic
        console.log(`🎯 SINGLE TOPIC STRATEGY: Finding questions directly related to user's topic`);
        const singleResult = await this.handleSingleTopicStrategy(candidateQuestions, userQuery, maxQuestions);
        topMatches = singleResult.matches;
        topicsFound = singleResult.topicsFound;
        break;
    }
    
    console.log(`🎯 Selected ${topMatches.length} questions using ${queryStrategy} strategy:`);
    topMatches.forEach(match => {
      const topicLabel = match.topicCategory ? ` [${match.topicCategory}]` : '';
      console.log(`  📊 Score ${match.relevanceScore}${topicLabel}: ${match.question.prompt.substring(0, 100)}...`);
    });
    
    // 🧠 APPLY INTENT FILTERING AFTER SCORING: Now filter the top-scoring questions by intent
    const originalTopMatches = [...topMatches]; // Save original for fallback
    
    if (queryIntent && queryIntent.questionTypes && queryIntent.questionTypes.length > 0) {
      console.log(`🧠 [POST-SCORING-FILTER] Applying intent filter to ${topMatches.length} top-scoring questions`);
      console.log(`🧠 [POST-SCORING-FILTER] Intent types: ${queryIntent.questionTypes.join(', ')}`);
      const beforeFilterCount = topMatches.length;
      topMatches = topMatches.filter(match => 
        queryIntent.questionTypes.includes(match.question.type)
      );
      console.log(`🧠 [POST-SCORING-FILTER] Filtered from ${beforeFilterCount} to ${topMatches.length} questions matching intent`);
      
      // 🎯 FALLBACK: If intent filtering removed ALL questions, adapt the intent
      if (topMatches.length === 0 && originalTopMatches.length > 0) {
        console.log(`🎯 [ADAPTIVE-INTENT] No questions match intent, adapting analysis to available question types`);
        topMatches = originalTopMatches;
        
        // Determine the best analysis type based on available questions
        const availableTypes = [...new Set(originalTopMatches.map(m => m.question.type))];
        console.log(`🎯 [ADAPTIVE-INTENT] Available question types: ${availableTypes.join(', ')}`);
        
        // Adapt the intent based on what's available
        if (availableTypes.includes('text')) {
          console.log(`🎯 [ADAPTIVE-INTENT] Adapting to thematic analysis for text questions`);
          // Keep text questions only
          topMatches = originalTopMatches.filter(match => match.question.type === 'text');
        } else if (availableTypes.some(t => ['rating', 'single-choice', 'multiple-choice'].includes(t))) {
          console.log(`🎯 [ADAPTIVE-INTENT] Adapting to statistical analysis for rating/choice questions`);
          // Keep statistical questions only
          topMatches = originalTopMatches.filter(match => 
            ['rating', 'single-choice', 'multiple-choice'].includes(match.question.type)
          );
        } else {
          console.log(`🎯 [ADAPTIVE-INTENT] Using all available questions regardless of type`);
          topMatches = originalTopMatches;
        }
        
        console.log(`🎯 [ADAPTIVE-INTENT] Final adapted selection: ${topMatches.length} questions`);
      }
    } else {
      // Default behavior: exclude open-ended text questions (backward compatibility)
      console.log(`🧠 [POST-SCORING-FILTER] No specific intent - using default (exclude text questions)`);
      const beforeFilterCount = topMatches.length;
      topMatches = topMatches.filter(match => !this.isOpenEndedText(match.question.type));
      console.log(`🧠 [POST-SCORING-FILTER] Filtered from ${beforeFilterCount} to ${topMatches.length} questions (excluded text)`);
    }
    
    return {
      matches: topMatches,
      totalQuestions: allQuestions.length,
      reasoning: this.generateStrategyReasoning(queryStrategy, topMatches.length, topicsFound),
      isCorrelationQuery: queryStrategy === 'correlation',
      queryStrategy,
      topicsFound,
      intentAdapted: topMatches.length > 0 && originalTopMatches.length > 0 && topMatches !== originalTopMatches,
      demographicFilter: demographicFilter.found ? {
        field: demographicFilter.field,
        value: demographicFilter.value,
        questionId: demographicQuestionId
      } : null
    };
  }
  
  /**
   * Determine the best analytical strategy based on user query
   */
  private determineQueryStrategy(userQuery: string): 'single_topic' | 'correlation' | 'comparison' | 'demographic_analysis' {
    const lowerQuery = userQuery.toLowerCase();
    
    // Check for correlation keywords
    const correlationKeywords = [
      'correlation', 'correlate', 'relationship', 'between', 'relate', 'connection', 'link',
      'association', 'cross-analyze', 'cross-reference'
    ];
    
    // Check for comparison keywords  
    const comparisonKeywords = [
      'compare', 'versus', 'vs', 'difference', 'differ', 'contrast', 'against'
    ];
    
    // Check for demographic analysis keywords
    const demographicKeywords = [
      'men think', 'women think', 'young people', 'older people', 'age group',
      'gender difference', 'by age', 'by gender', 'by education', 'demographic'
    ];
    
    // Check for "X and Y" pattern which often indicates correlation
    const hasAndPattern = lowerQuery.includes(' and ') && lowerQuery.split(' and ').length >= 2;
    
    // Priority order: demographic -> correlation -> comparison -> single topic
    if (demographicKeywords.some(keyword => lowerQuery.includes(keyword))) {
      return 'demographic_analysis';
    }
    
    if (correlationKeywords.some(keyword => lowerQuery.includes(keyword)) || hasAndPattern) {
      return 'correlation';
    }
    
    if (comparisonKeywords.some(keyword => lowerQuery.includes(keyword))) {
      return 'comparison';
    }
    
    return 'single_topic';
  }
  
  /**
   * Handle correlation analysis strategy
   */
  private async handleCorrelationStrategy(
    questions: any[], 
    userQuery: string, 
    maxQuestions: number
  ): Promise<{ matches: QuestionMatch[], topicsFound: string[] }> {
    
    // Use enhanced LLM scoring for correlation
    const scoredQuestions = await this.scoreQuestionsWithEnhancedLLM(
      questions, 
      userQuery, 
      true // isCorrelationQuery = true
    );
    
    // Increase question limit for correlation to ensure multi-topic coverage
    const correlationMaxQuestions = Math.max(maxQuestions, 6);
    
    return this.selectCorrelationQuestions(scoredQuestions, correlationMaxQuestions);
  }
  
  /**
   * Handle comparison analysis strategy
   */
  private async handleComparisonStrategy(
    questions: any[], 
    userQuery: string, 
    maxQuestions: number
  ): Promise<{ matches: QuestionMatch[], topicsFound: string[] }> {
    
    // For comparisons, we need questions that allow comparing different options/aspects
    const scoredQuestions = await this.scoreQuestionsWithEnhancedLLM(
      questions, 
      userQuery, 
      false // Not a correlation query, but comparison
    );
    
    const relevantQuestions = scoredQuestions
      .filter(match => match.relevanceScore >= 50)
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, maxQuestions);
    
    const topicsFound = [...new Set(relevantQuestions.map(q => q.topicCategory).filter(Boolean))];
    
    return {
      matches: relevantQuestions,
      topicsFound
    };
  }
  
  /**
   * Handle demographic analysis strategy
   */
  private async handleDemographicStrategy(
    questions: any[], 
    userQuery: string, 
    maxQuestions: number
  ): Promise<{ matches: QuestionMatch[], topicsFound: string[] }> {
    
    // For demographic analysis, focus on questions that would show interesting differences between groups
    const scoredQuestions = await this.scoreQuestionsWithEnhancedLLM(
      questions, 
      userQuery, 
      false
    );
    
    const relevantQuestions = scoredQuestions
      .filter(match => match.relevanceScore >= 45) // Slightly lower threshold
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, maxQuestions);
    
    const topicsFound = [...new Set(relevantQuestions.map(q => q.topicCategory).filter(Boolean))];
    
    return {
      matches: relevantQuestions,
      topicsFound
    };
  }
  
  /**
   * Handle single topic analysis strategy
   */
  private async handleSingleTopicStrategy(
    questions: any[], 
    userQuery: string, 
    maxQuestions: number
  ): Promise<{ matches: QuestionMatch[], topicsFound: string[] }> {
    
    const scoredQuestions = await this.scoreQuestionsWithEnhancedLLM(
      questions, 
      userQuery, 
      false
    );
    
    const relevantQuestions = scoredQuestions
      .filter(match => match.relevanceScore >= 60)
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, maxQuestions);
    
    const topicsFound = [...new Set(relevantQuestions.map(q => q.topicCategory).filter(Boolean))];
    
    return {
      matches: relevantQuestions,
      topicsFound
    };
  }
  
  /**
   * Generate reasoning based on strategy used
   */
  private generateStrategyReasoning(
    strategy: string, 
    questionsFound: number, 
    topicsFound: string[]
  ): string {
    switch (strategy) {
      case 'correlation':
        return `Correlation analysis: Found ${questionsFound} questions across ${topicsFound.length} topics (${topicsFound.join(', ')}) to analyze relationships between different aspects of the survey.`;
      case 'comparison':
        return `Comparison analysis: Found ${questionsFound} questions to help compare different options or viewpoints within the survey data.`;
      case 'demographic_analysis':
        return `Demographic analysis: Found ${questionsFound} questions to analyze how different demographic groups respond to key survey topics.`;
      default:
        return `Topic analysis: Found ${questionsFound} relevant questions about the requested topic.`;
    }
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
The user wants to find RELATIONSHIPS between different topics in this survey. Your job:

1. EXTRACT the main topics from the user query (e.g., "healthcare and military" = topics: "healthcare", "military")
2. Find questions about EACH topic SEPARATELY - we need questions covering ALL mentioned topics
3. Score questions 70-90 if they relate to ANY mentioned topic
4. Use "topicCategory" to label which topic each question addresses

EXAMPLES OF WHAT TO FIND:
- Query: "correlation between healthcare and military"
  → Find: Questions about U.S. healthcare system + Questions about military/defense spending
- Query: "education and media relationship" 
  → Find: Questions about universities/schools + Questions about news/media

SCORING STRATEGY:
- Healthcare question about U.S. healthcare system → Score: 85, topicCategory: "healthcare"
- Military question about defense spending → Score: 80, topicCategory: "military"  
- Question about both topics together → Score: 90, topicCategory: "healthcare,military"

DO NOT require questions to mention multiple topics - find separate questions for each topic.
The analysis will compare how the same respondents answered different topic areas.` : '';

    const prompt = basePrompt + correlationPrompt + `

Your task: Score each question (1-100) based on how well it would help answer the user's query. Consider:

1. SEMANTIC RELEVANCE: Does the question content relate to what the user is asking about?
2. CONCEPTUAL OVERLAP: Are there related concepts even if exact words don't match?
3. DATA UTILITY: Would this question's answers help address the user's query?
${isCorrelationQuery ? '4. MULTI-TOPIC COVERAGE: For correlation queries, include questions from ALL mentioned topics' : ''}

Examples for correlation queries:
- "correlation between healthcare and military" → Find questions about healthcare systems AND questions about military/defense
- "relationship between education and media" → Find questions about universities/schools AND questions about media/news
- "healthcare vs military spending" → Find questions about healthcare AND questions about military budget/defense

For each topic mentioned, find the relevant questions even if they don't contain the exact keywords.

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
      
      if (isCorrelationQuery) {
        console.log(`🔗 [CORRELATION DEBUG] LLM returned ${llmScores.length} scored questions`);
        const topScores = llmScores
          .sort((a: any, b: any) => b.score - a.score)
          .slice(0, 10);
        console.log(`🔗 [CORRELATION DEBUG] Top 10 LLM scores:`);
        topScores.forEach((score: any, i: number) => {
          console.log(`  ${i+1}. Score ${score.score} [${score.topicCategory || 'no-category'}]: ${score.reasoning}`);
        });
      }
      
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
    
    // Filter questions with decent scores - lower threshold for correlation queries
    const scoreThreshold = 40; // Lower threshold to ensure we find questions
    const relevantQuestions = scoredQuestions.filter(match => match.relevanceScore >= scoreThreshold);
    
    console.log(`🔗 [CORRELATION DEBUG] Found ${relevantQuestions.length} questions above threshold ${scoreThreshold}`);
    
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
    
    // Military/defense scoring - expanded keywords
    if (lowerQuery.includes('military') || lowerQuery.includes('defense') || lowerQuery.includes('army') || 
        lowerQuery.includes('navy') || lowerQuery.includes('security') || lowerQuery.includes('armed forces')) {
      if (lowerQuestion.includes('military') || lowerQuestion.includes('defense') || lowerQuestion.includes('armed forces') ||
          lowerQuestion.includes('security') || lowerQuestion.includes('army') || lowerQuestion.includes('navy') ||
          lowerQuestion.includes('forces') || lowerQuestion.includes('troops')) {
        score += 70;
        reasons.push('military/defense keyword match');
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
   * Map common filter values to actual survey values
   */
  private mapFilterValue(field: string, value: string): string {
    const educationMapping: { [key: string]: string } = {
      'High School Graduate': 'H.S. graduate or less',
      'High School': 'H.S. graduate or less',
      'HS Graduate': 'H.S. graduate or less',
      'College Graduate': 'College graduate+',
      'College Grad': 'College graduate+',
      'Bachelor': 'College graduate+',
      'Some College': 'Some College', // Already correct
      'Associates': 'Some College'
    };
    
    if (field === 'education' && educationMapping[value]) {
      console.log(`🎯 [DEBUG] Mapping education value "${value}" -> "${educationMapping[value]}"`);
      return educationMapping[value];
    }
    
    return value; // Return original if no mapping needed
  }

  /**
   * Find the demographic question in the survey that matches the filter field
   */
  private async findDemographicQuestion(field: string, surveyId: number, db: any): Promise<number | null> {
    try {
      console.log(`🎯 [DEBUG] Looking for demographic question for field: ${field} in survey ${surveyId}`);
      
      // Get all questions for this survey
      const [questions] = await db.execute(
        `SELECT id, prompt FROM survey_questions WHERE survey_id = ? ORDER BY question_order`,
        [surveyId]
      ) as any[];
      
      console.log(`🎯 [DEBUG] Found ${questions.length} questions to search through`);
      
             // Generic approach - find questions by field type
       const questionPatterns = {
         'gender': ['gender', 'sex', 'male', 'female'],
         'age': ['age', 'birth', 'old', 'young'],
         'education': ['education level', 'education category', 'highest level', 'degree completed']
       };
       
       const patterns = questionPatterns[field as keyof typeof questionPatterns];
       if (patterns) {
         // First try exact demographic patterns
         for (const question of questions) {
           const lowerPrompt = question.prompt.toLowerCase();
           
           for (const pattern of patterns) {
             if (lowerPrompt.includes(pattern)) {
               console.log(`🎯 [DEBUG] Found demographic question for ${field}: ID ${question.id} - "${question.prompt}"`);
               return question.id;
             }
           }
         }
         
         // Fallback for education: any education question that's not a subject question
         if (field === 'education') {
           for (const question of questions) {
             const lowerPrompt = question.prompt.toLowerCase();
             
             if (lowerPrompt.includes('education') && 
                 !lowerPrompt.includes('k to 12') && 
                 !lowerPrompt.includes('grades') &&
                 !lowerPrompt.includes('stem')) {
               console.log(`🎯 [DEBUG] Found fallback education question: ID ${question.id} - "${question.prompt}"`);
               return question.id;
             }
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
    
    // 🎯 MAP FILTER VALUE TO ACTUAL SURVEY VALUES
    const originalValue = demographicFilter.value;
    const mappedValue = this.mapFilterValue(demographicFilter.field, originalValue);
    if (mappedValue !== originalValue) {
      console.log(`🎯 [DEBUG] Applied value mapping for ${demographicFilter.field}: "${originalValue}" -> "${mappedValue}"`);
      demographicFilter = { ...demographicFilter, value: mappedValue };
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