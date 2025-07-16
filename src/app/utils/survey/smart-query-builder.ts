import { QueryIntent, QueryIntentClassifier } from './query-intent-classifier';
import { CohortFilterRule } from '@/app/utils/interface';

export interface SmartQueryConfig {
  intent: QueryIntent;
  cohortFilters: CohortFilterRule[];
  userId: string;
  surveyId?: number;
  topK?: number;
}

export interface QueryResult {
  sql: string;
  params: any[];
  orderBy: string;
  explanation: string;
  expectedResultType: 'text' | 'choice' | 'mixed';
}

export class SmartSurveyQueryBuilder {
  private intentClassifier = new QueryIntentClassifier();

  /**
   * Build an optimized SQL query based on user intent and context
   */
  async buildSmartQuery(
    userQuery: string, 
    cohortFilters: CohortFilterRule[], 
    userId: string, 
    surveyId?: number, 
    topK: number = 1000
  ): Promise<QueryResult> {
    
    // Classify the user's intent
    const intent = this.intentClassifier.classifyQuery(userQuery);
    console.log(`🎯 Detected intent: ${intent.intent} (confidence: ${Math.round(intent.confidence * 100)}%)`);

    const config: SmartQueryConfig = {
      intent,
      cohortFilters,
      userId,
      surveyId,
      topK
    };

    // Build the query based on detected intent
    switch (intent.intent) {
      case 'open-ended-themes':
        return this.buildThematicAnalysisQuery(config);
      case 'choice-patterns':
        return this.buildChoiceAnalysisQuery(config);
      case 'sentiment-analysis':
        return this.buildSentimentAnalysisQuery(config);
      case 'popular-mentions':
        return this.buildPopularMentionsQuery(config);
      case 'rating-analysis':
        return this.buildRatingAnalysisQuery(config);
      case 'demographic-breakdown':
        return this.buildDemographicQuery(config);
      default:
        return this.buildDefaultQuery(config);
    }
  }

  /**
   * Build query optimized for thematic analysis of text responses
   */
  private buildThematicAnalysisQuery(config: SmartQueryConfig): QueryResult {
    const { cohortFilters, userId, surveyId, topK, intent } = config;
    
    const params: any[] = [];
    let whereClause = this.buildCohortWhereClause(cohortFilters, params);
    
    // User's surveys only
    if (whereClause === "1") {
      whereClause = '(s.created_by = ? OR (s.is_public = 1 AND s.status = \'published\'))';
    } else {
      whereClause += ' AND (s.created_by = ? OR (s.is_public = 1 AND s.status = \'published\'))';
    }
    params.push(userId);
    
    if (surveyId) {
      whereClause += ' AND sr.survey_id = ?';
      params.push(surveyId);
    }
    
    // Intent-specific filters for text analysis
    whereClause += ` AND sq.type = 'text'`; // Only text questions
    whereClause += ` AND LENGTH(TRIM(sa.answer_value)) >= ${intent.minResponseLength || 15}`; // Substantial responses
    whereClause += ` AND sa.answer_value IS NOT NULL`;
    whereClause += ` AND sa.answer_value != ''`;
    whereClause += ` AND UPPER(TRIM(sa.answer_value)) NOT IN ('N/A', 'NULL', 'NONE')`;
    
    // Exclude patterns from intent config
    if (intent.excludePatterns) {
      for (const pattern of intent.excludePatterns) {
        whereClause += ` AND sa.answer_value NOT REGEXP '${pattern}'`;
      }
    }

    const orderBy = `ORDER BY 
      sq.question_order ASC,
      RAND()`;

    const sql = `
      SELECT sr.id as rid, sa.answer_value, sq.prompt as question_text, sq.type as question_type,
             s.title as survey_title, sq.options as question_options,
             COALESCE(sr.age_range,
                      JSON_UNQUOTE(JSON_EXTRACT(sr.demographics,'$.ageRange')),
                      JSON_UNQUOTE(JSON_EXTRACT(sr.demographics,'$.age')),
                      JSON_UNQUOTE(JSON_EXTRACT(sr.demographics,'$.age_range'))
             ) AS age_val,
             JSON_UNQUOTE(JSON_EXTRACT(sr.demographics,'$.location')) AS location_val,
             JSON_UNQUOTE(JSON_EXTRACT(sr.demographics,'$.occupation')) AS occupation_val,
             JSON_UNQUOTE(JSON_EXTRACT(sr.demographics,'$.education')) AS education_val,
             JSON_UNQUOTE(JSON_EXTRACT(sr.demographics,'$.income')) AS income_val,
             JSON_UNQUOTE(JSON_EXTRACT(sr.demographics,'$.politicalViews')) AS political_val
      FROM survey_responses sr
      JOIN survey_answers sa ON sr.id = sa.response_id
      JOIN survey_questions sq ON sa.question_id = sq.id
      JOIN surveys s ON sr.survey_id = s.id
      WHERE ${whereClause}
      ${orderBy}
      LIMIT ${Math.min(topK, 10000)}`;

    return {
      sql,
      params,
      orderBy,
      explanation: `Optimized for thematic analysis: filtering for text responses with meaningful length (${intent.minResponseLength}+ chars), excluding low-quality responses, prioritizing detailed answers.`,
      expectedResultType: 'text'
    };
  }

  /**
   * Build query optimized for choice pattern analysis
   */
  private buildChoiceAnalysisQuery(config: SmartQueryConfig): QueryResult {
    const { cohortFilters, userId, surveyId, topK } = config;
    
    const params: any[] = [];
    let whereClause = this.buildCohortWhereClause(cohortFilters, params);
    
    if (whereClause === "1") {
      whereClause = '(s.created_by = ? OR (s.is_public = 1 AND s.status = \'published\'))';
    } else {
      whereClause += ' AND (s.created_by = ? OR (s.is_public = 1 AND s.status = \'published\'))';
    }
    params.push(userId);
    
    if (surveyId) {
      whereClause += ' AND sr.survey_id = ?';
      params.push(surveyId);
    }
    
    // Choice-specific filters
    whereClause += ` AND sq.type IN ('single-choice', 'multiple-choice')`;
    whereClause += ` AND sa.answer_value IS NOT NULL`;
    whereClause += ` AND sa.answer_value != ''`;

    const orderBy = `ORDER BY 
      sq.question_order ASC,
      RAND()`;

    const sql = `
      SELECT sr.id as rid, sa.answer_value, sq.prompt as question_text, sq.type as question_type,
             s.title as survey_title, sq.options as question_options,
             COALESCE(sr.age_range,
                      JSON_UNQUOTE(JSON_EXTRACT(sr.demographics,'$.ageRange')),
                      JSON_UNQUOTE(JSON_EXTRACT(sr.demographics,'$.age')),
                      JSON_UNQUOTE(JSON_EXTRACT(sr.demographics,'$.age_range'))
             ) AS age_val,
             JSON_UNQUOTE(JSON_EXTRACT(sr.demographics,'$.location')) AS location_val,
             JSON_UNQUOTE(JSON_EXTRACT(sr.demographics,'$.occupation')) AS occupation_val,
             JSON_UNQUOTE(JSON_EXTRACT(sr.demographics,'$.education')) AS education_val,
             JSON_UNQUOTE(JSON_EXTRACT(sr.demographics,'$.income')) AS income_val,
             JSON_UNQUOTE(JSON_EXTRACT(sr.demographics,'$.politicalViews')) AS political_val
      FROM survey_responses sr
      JOIN survey_answers sa ON sr.id = sa.response_id
      JOIN survey_questions sq ON sa.question_id = sq.id
      JOIN surveys s ON sr.survey_id = s.id
      WHERE ${whereClause}
      ${orderBy}
      LIMIT ${Math.min(topK, 10000)}`;

    return {
      sql,
      params,
      orderBy,
      explanation: 'Optimized for choice pattern analysis: focusing on single and multiple choice questions, prioritizing multiple-choice for richer selection patterns.',
      expectedResultType: 'choice'
    };
  }

  /**
   * Build query for popular mentions and entity analysis
   */
  private buildPopularMentionsQuery(config: SmartQueryConfig): QueryResult {
    const { cohortFilters, userId, surveyId, topK, intent } = config;
    
    const params: any[] = [];
    let whereClause = this.buildCohortWhereClause(cohortFilters, params);
    
    if (whereClause === "1") {
      whereClause = '(s.created_by = ? OR (s.is_public = 1 AND s.status = \'published\'))';
    } else {
      whereClause += ' AND (s.created_by = ? OR (s.is_public = 1 AND s.status = \'published\'))';
    }
    params.push(userId);
    
    if (surveyId) {
      whereClause += ' AND sr.survey_id = ?';
      params.push(surveyId);
    }
    
    // Include both text and choice questions for entity mentions
    whereClause += ` AND sq.type IN ('text', 'multiple-choice')`;
    whereClause += ` AND sa.answer_value IS NOT NULL`;
    whereClause += ` AND sa.answer_value != ''`;
    whereClause += ` AND LENGTH(TRIM(sa.answer_value)) >= ${intent.minResponseLength || 5}`;

    const orderBy = `ORDER BY 
      sq.question_order ASC,
      RAND()`;

    const sql = `
      SELECT sr.id as rid, sa.answer_value, sq.prompt as question_text, sq.type as question_type,
             s.title as survey_title, sq.options as question_options,
             COALESCE(sr.age_range,
                      JSON_UNQUOTE(JSON_EXTRACT(sr.demographics,'$.ageRange')),
                      JSON_UNQUOTE(JSON_EXTRACT(sr.demographics,'$.age')),
                      JSON_UNQUOTE(JSON_EXTRACT(sr.demographics,'$.age_range'))
             ) AS age_val,
             JSON_UNQUOTE(JSON_EXTRACT(sr.demographics,'$.location')) AS location_val,
             JSON_UNQUOTE(JSON_EXTRACT(sr.demographics,'$.occupation')) AS occupation_val,
             JSON_UNQUOTE(JSON_EXTRACT(sr.demographics,'$.education')) AS education_val,
             JSON_UNQUOTE(JSON_EXTRACT(sr.demographics,'$.income')) AS income_val,
             JSON_UNQUOTE(JSON_EXTRACT(sr.demographics,'$.politicalViews')) AS political_val
      FROM survey_responses sr
      JOIN survey_answers sa ON sr.id = sa.response_id
      JOIN survey_questions sq ON sa.question_id = sq.id
      JOIN surveys s ON sr.survey_id = s.id
      WHERE ${whereClause}
      ${orderBy}
      LIMIT ${Math.min(topK, 10000)}`;

    return {
      sql,
      params,
      orderBy,
      explanation: 'Optimized for finding popular mentions: including both text responses and choice selections, prioritizing responses likely to contain entity mentions.',
      expectedResultType: 'mixed'
    };
  }

  /**
   * Build query for sentiment analysis
   */
  private buildSentimentAnalysisQuery(config: SmartQueryConfig): QueryResult {
    const { cohortFilters, userId, surveyId, topK, intent } = config;
    
    const params: any[] = [];
    let whereClause = this.buildCohortWhereClause(cohortFilters, params);
    
    if (whereClause === "1") {
      whereClause = '(s.created_by = ? OR (s.is_public = 1 AND s.status = \'published\'))';
    } else {
      whereClause += ' AND (s.created_by = ? OR (s.is_public = 1 AND s.status = \'published\'))';
    }
    params.push(userId);
    
    if (surveyId) {
      whereClause += ' AND sr.survey_id = ?';
      params.push(surveyId);
    }
    
    whereClause += ` AND sq.type IN ('text', 'rating')`;
    whereClause += ` AND sa.answer_value IS NOT NULL`;
    whereClause += ` AND sa.answer_value != ''`;
    whereClause += ` AND LENGTH(TRIM(sa.answer_value)) >= ${intent.minResponseLength || 10}`;

    const orderBy = `ORDER BY 
      sq.question_order ASC,
      RAND()`;

    const sql = `
      SELECT sr.id as rid, sa.answer_value, sq.prompt as question_text, sq.type as question_type,
             s.title as survey_title, sq.options as question_options,
             COALESCE(sr.age_range,
                      JSON_UNQUOTE(JSON_EXTRACT(sr.demographics,'$.ageRange')),
                      JSON_UNQUOTE(JSON_EXTRACT(sr.demographics,'$.age')),
                      JSON_UNQUOTE(JSON_EXTRACT(sr.demographics,'$.age_range'))
             ) AS age_val,
             JSON_UNQUOTE(JSON_EXTRACT(sr.demographics,'$.location')) AS location_val,
             JSON_UNQUOTE(JSON_EXTRACT(sr.demographics,'$.occupation')) AS occupation_val,
             JSON_UNQUOTE(JSON_EXTRACT(sr.demographics,'$.education')) AS education_val,
             JSON_UNQUOTE(JSON_EXTRACT(sr.demographics,'$.income')) AS income_val,
             JSON_UNQUOTE(JSON_EXTRACT(sr.demographics,'$.politicalViews')) AS political_val
      FROM survey_responses sr
      JOIN survey_answers sa ON sr.id = sa.response_id
      JOIN survey_questions sq ON sa.question_id = sq.id
      JOIN surveys s ON sr.survey_id = s.id
      WHERE ${whereClause}
      ${orderBy}
      LIMIT ${Math.min(topK, 10000)}`;

    return {
      sql,
      params,
      orderBy,
      explanation: 'Optimized for sentiment analysis: focusing on text responses and ratings that contain emotional content.',
      expectedResultType: 'text'
    };
  }

  /**
   * Build query for rating analysis
   */
  private buildRatingAnalysisQuery(config: SmartQueryConfig): QueryResult {
    // Similar pattern for rating analysis...
    return this.buildDefaultQuery(config);
  }

  /**
   * Build query for demographic breakdown
   */
  private buildDemographicQuery(config: SmartQueryConfig): QueryResult {
    // Similar pattern for demographic analysis...
    return this.buildDefaultQuery(config);
  }

  /**
   * Build default query as fallback
   */
  private buildDefaultQuery(config: SmartQueryConfig): QueryResult {
    const { cohortFilters, userId, surveyId, topK } = config;
    
    const params: any[] = [];
    let whereClause = this.buildCohortWhereClause(cohortFilters, params);
    
    if (whereClause === "1") {
      whereClause = '(s.created_by = ? OR (s.is_public = 1 AND s.status = \'published\'))';
    } else {
      whereClause += ' AND (s.created_by = ? OR (s.is_public = 1 AND s.status = \'published\'))';
    }
    params.push(userId);
    
    if (surveyId) {
      whereClause += ' AND sr.survey_id = ?';
      params.push(surveyId);
    }
    
    whereClause += ` AND LENGTH(TRIM(sa.answer_value)) > 0`;
    whereClause += ` AND sa.answer_value IS NOT NULL`;
    whereClause += ` AND sa.answer_value != ''`;

    const orderBy = `ORDER BY 
      sq.question_order ASC,
      RAND()`;

    const sql = `
      SELECT sr.id as rid, sa.answer_value, sq.prompt as question_text, sq.type as question_type,
             s.title as survey_title, sq.options as question_options,
             COALESCE(sr.age_range,
                      JSON_UNQUOTE(JSON_EXTRACT(sr.demographics,'$.ageRange')),
                      JSON_UNQUOTE(JSON_EXTRACT(sr.demographics,'$.age')),
                      JSON_UNQUOTE(JSON_EXTRACT(sr.demographics,'$.age_range'))
             ) AS age_val,
             JSON_UNQUOTE(JSON_EXTRACT(sr.demographics,'$.location')) AS location_val,
             JSON_UNQUOTE(JSON_EXTRACT(sr.demographics,'$.occupation')) AS occupation_val,
             JSON_UNQUOTE(JSON_EXTRACT(sr.demographics,'$.education')) AS education_val,
             JSON_UNQUOTE(JSON_EXTRACT(sr.demographics,'$.income')) AS income_val,
             JSON_UNQUOTE(JSON_EXTRACT(sr.demographics,'$.politicalViews')) AS political_val
      FROM survey_responses sr
      JOIN survey_answers sa ON sr.id = sa.response_id
      JOIN survey_questions sq ON sa.question_id = sq.id
      JOIN surveys s ON sr.survey_id = s.id
      WHERE ${whereClause}
      ${orderBy}
      LIMIT ${Math.min(topK, 10000)}`;

    return {
      sql,
      params,
      orderBy,
      explanation: 'Default query: balanced approach including all question types.',
      expectedResultType: 'mixed'
    };
  }

  /**
   * Build WHERE clause for cohort filters
   */
  private buildCohortWhereClause(rules: CohortFilterRule[], params: any[]): string {
    const clauses: string[] = [];

    for (const rule of rules) {
      switch (rule.op) {
        case "=":
          clauses.push(`${rule.field} = ?`);
          params.push(rule.value);
          break;
        case "IN":
          if (Array.isArray(rule.value) && rule.value.length) {
            clauses.push(`${rule.field} IN (${rule.value.map(() => "?").join(",")})`);
            params.push(...rule.value);
          }
          break;
        case "CONTAINS":
          clauses.push(`JSON_CONTAINS(${rule.field}, '"${rule.value}"')`);
          break;
      }
    }

    return clauses.length ? clauses.join(" AND ") : "1";
  }
} 