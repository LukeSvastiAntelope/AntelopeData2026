import { QueryIntent, QueryIntentClassifier } from './query-intent-classifier';
import { CohortFilterRule } from '@/app/utils/interface';
import { DemographicField, DEMOGRAPHIC_FIELDS } from '@/app/utils/demographic-system-v2';

export interface EnhancedQueryConfig {
  intent: QueryIntent;
  cohortFilters: CohortFilterRule[];
  userId: string;
  surveyId?: number;
  topK?: number;
}

export interface EnhancedQueryResult {
  sql: string;
  params: any[];
  orderBy: string;
  explanation: string;
  expectedResultType: 'text' | 'choice' | 'mixed';
  demographicFields: string[]; // Which demographic fields are being extracted
}

/**
 * Enhanced query builder that provides consistent demographic field access
 * across different data storage formats (normalized vs. legacy mixed storage)
 */
export class EnhancedSurveyQueryBuilder {
  private intentClassifier = new QueryIntentClassifier();

  /**
   * Build an optimized SQL query with consistent demographic field handling
   */
  async buildEnhancedQuery(
    userQuery: string, 
    cohortFilters: CohortFilterRule[], 
    userId: string, 
    surveyId?: number, 
    topK: number = 1000
  ): Promise<EnhancedQueryResult> {
    
    // Classify the user's intent
    const intent = this.intentClassifier.classifyQuery(userQuery);
    console.log(`🎯 Enhanced Query - Detected intent: ${intent.intent} (confidence: ${Math.round(intent.confidence * 100)}%)`);

    const config: EnhancedQueryConfig = {
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
   * Generate consistent demographic field selection that works with both
   * new normalized storage and legacy mixed storage formats
   */
  private getDemographicFieldSelects(surveyId?: number): string {
    const fields: string[] = [];
    
    // Build survey_id filter for subqueries if provided
    const surveyFilter = surveyId ? `AND sq.survey_id = ${surveyId}` : '';
    
    // Age field - try multiple sources for compatibility
    fields.push(`
      COALESCE(
        sr.age,                                                          -- New normalized field
        sr.age_range,                                                    -- Legacy age_range field
        JSON_UNQUOTE(JSON_EXTRACT(sr.demographics,'$.age')),            -- JSON age
        JSON_UNQUOTE(JSON_EXTRACT(sr.demographics,'$.ageRange')),       -- JSON ageRange
        JSON_UNQUOTE(JSON_EXTRACT(sr.demographics,'$.age_range')),      -- JSON age_range
        (SELECT sa.answer_value FROM survey_answers sa 
         JOIN survey_questions sq ON sa.question_id = sq.id 
         WHERE sa.response_id = sr.id 
         AND (LOWER(sq.prompt) LIKE '%age%' OR LOWER(sq.prompt) LIKE '%old%')
         ${surveyFilter}
         LIMIT 1)                                                       -- Survey answer fallback
      ) AS age_val
    `);

    // Gender field - prioritize survey answers, then JSON
    fields.push(`
      COALESCE(
        sr.gender,                                                       -- New normalized field
        JSON_UNQUOTE(JSON_EXTRACT(sr.demographics,'$.gender')),         -- JSON gender
        (SELECT sa.answer_value FROM survey_answers sa 
         JOIN survey_questions sq ON sa.question_id = sq.id 
         WHERE sa.response_id = sr.id 
         AND (LOWER(sq.prompt) LIKE '%gender%' OR LOWER(sq.prompt) LIKE '%sex%' OR sq.prompt LIKE '%What is your gender%')
         ${surveyFilter}
         LIMIT 1)                                                       -- Survey answer fallback
      ) AS gender_val
    `);

    // Location field - handle both string and JSON array formats
    fields.push(`
      COALESCE(
        sr.location,                                                     -- New normalized field
        JSON_UNQUOTE(JSON_EXTRACT(sr.demographics,'$.location')),       -- JSON location
        JSON_UNQUOTE(JSON_EXTRACT(sr.demographics,'$.city')),           -- JSON city
        (SELECT sa.answer_value FROM survey_answers sa 
         JOIN survey_questions sq ON sa.question_id = sq.id 
         WHERE sa.response_id = sr.id 
         AND (LOWER(sq.prompt) LIKE '%location%' OR LOWER(sq.prompt) LIKE '%city%' OR LOWER(sq.prompt) LIKE '%where%' OR LOWER(sq.prompt) LIKE '%live%')
         ${surveyFilter}
         LIMIT 1)                                                       -- Survey answer fallback
      ) AS location_val
    `);

    // Occupation field
    fields.push(`
      COALESCE(
        sr.occupation,                                                   -- New normalized field
        JSON_UNQUOTE(JSON_EXTRACT(sr.demographics,'$.occupation')),     -- JSON occupation
        JSON_UNQUOTE(JSON_EXTRACT(sr.demographics,'$.job')),            -- JSON job
        (SELECT sa.answer_value FROM survey_answers sa 
         JOIN survey_questions sq ON sa.question_id = sq.id 
         WHERE sa.response_id = sr.id 
         AND (LOWER(sq.prompt) LIKE '%occupation%' OR LOWER(sq.prompt) LIKE '%job%' OR LOWER(sq.prompt) LIKE '%work%' OR LOWER(sq.prompt) LIKE '%employ%')
         ${surveyFilter}
         LIMIT 1)                                                       -- Survey answer fallback
      ) AS occupation_val
    `);

    // Education field
    fields.push(`
      COALESCE(
        sr.education,                                                    -- New normalized field
        JSON_UNQUOTE(JSON_EXTRACT(sr.demographics,'$.education')),      -- JSON education
        (SELECT sa.answer_value FROM survey_answers sa 
         JOIN survey_questions sq ON sa.question_id = sq.id 
         WHERE sa.response_id = sr.id 
         AND (LOWER(sq.prompt) LIKE '%education%' OR LOWER(sq.prompt) LIKE '%degree%' OR LOWER(sq.prompt) LIKE '%school%')
         ${surveyFilter}
         LIMIT 1)                                                       -- Survey answer fallback
      ) AS education_val
    `);

    // Income field
    fields.push(`
      COALESCE(
        sr.income,                                                       -- New normalized field
        JSON_UNQUOTE(JSON_EXTRACT(sr.demographics,'$.income')),         -- JSON income
        (SELECT sa.answer_value FROM survey_answers sa 
         JOIN survey_questions sq ON sa.question_id = sq.id 
         WHERE sa.response_id = sr.id 
         AND (LOWER(sq.prompt) LIKE '%income%' OR LOWER(sq.prompt) LIKE '%salary%' OR LOWER(sq.prompt) LIKE '%earn%')
         ${surveyFilter}
         LIMIT 1)                                                       -- Survey answer fallback
      ) AS income_val
    `);

    // Political affiliation field
    fields.push(`
      COALESCE(
        sr.political_affiliation,                                        -- New normalized field
        JSON_UNQUOTE(JSON_EXTRACT(sr.demographics,'$.political')),      -- JSON political
        JSON_UNQUOTE(JSON_EXTRACT(sr.demographics,'$.politicalAffiliation')),  -- JSON politicalAffiliation
        (SELECT sa.answer_value FROM survey_answers sa 
         JOIN survey_questions sq ON sa.question_id = sq.id 
         WHERE sa.response_id = sr.id 
         AND (LOWER(sq.prompt) LIKE '%political%' OR LOWER(sq.prompt) LIKE '%party%' OR LOWER(sq.prompt) LIKE '%republican%' OR LOWER(sq.prompt) LIKE '%democrat%')
         ${surveyFilter}
         LIMIT 1)                                                       -- Survey answer fallback
      ) AS political_val
    `);

    return fields.join(',\n        ');
  }

  /**
   * Build query optimized for thematic analysis of text responses
   */
  private buildThematicAnalysisQuery(config: EnhancedQueryConfig): EnhancedQueryResult {
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

    const demographicSelects = this.getDemographicFieldSelects(surveyId);

    const sql = `
      SELECT sr.id as rid, sa.answer_value, sq.prompt as question_text, sq.type as question_type,
             s.title as survey_title, sq.options as question_options,
             ${demographicSelects}
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
      explanation: `Enhanced thematic analysis: filtering for text responses with meaningful length (${intent.minResponseLength}+ chars), using smart demographic field resolution for consistent filtering.`,
      expectedResultType: 'text',
      demographicFields: ['age_val', 'gender_val', 'location_val', 'occupation_val', 'education_val', 'income_val', 'political_val']
    };
  }

  /**
   * Build query optimized for choice pattern analysis
   */
  private buildChoiceAnalysisQuery(config: EnhancedQueryConfig): EnhancedQueryResult {
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

    const demographicSelects = this.getDemographicFieldSelects(surveyId);

    const sql = `
      SELECT sr.id as rid, sa.answer_value, sq.prompt as question_text, sq.type as question_type,
             s.title as survey_title, sq.options as question_options,
             ${demographicSelects}
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
      explanation: 'Enhanced choice pattern analysis: focusing on single and multiple choice questions with smart demographic resolution.',
      expectedResultType: 'choice',
      demographicFields: ['age_val', 'gender_val', 'location_val', 'occupation_val', 'education_val', 'income_val', 'political_val']
    };
  }

  /**
   * Build query for popular mentions and entity analysis
   */
  private buildPopularMentionsQuery(config: EnhancedQueryConfig): EnhancedQueryResult {
    // Use default query with entity-focused ordering
    return this.buildDefaultQuery(config);
  }

  /**
   * Build query for sentiment analysis
   */
  private buildSentimentAnalysisQuery(config: EnhancedQueryConfig): EnhancedQueryResult {
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
    
    // Sentiment-specific filters
    whereClause += ` AND (sq.type = 'text' OR sq.type = 'rating')`;
    whereClause += ` AND LENGTH(TRIM(sa.answer_value)) >= 10`; // Meaningful responses
    whereClause += ` AND sa.answer_value IS NOT NULL`;
    whereClause += ` AND sa.answer_value != ''`;

    const orderBy = `ORDER BY 
      sq.question_order ASC,
      RAND()`;

    const demographicSelects = this.getDemographicFieldSelects(surveyId);

    const sql = `
      SELECT sr.id as rid, sa.answer_value, sq.prompt as question_text, sq.type as question_type,
             s.title as survey_title, sq.options as question_options,
             ${demographicSelects}
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
      explanation: 'Enhanced sentiment analysis: focusing on text responses and ratings with smart demographic resolution.',
      expectedResultType: 'text',
      demographicFields: ['age_val', 'gender_val', 'location_val', 'occupation_val', 'education_val', 'income_val', 'political_val']
    };
  }

  /**
   * Build query for rating analysis
   */
  private buildRatingAnalysisQuery(config: EnhancedQueryConfig): EnhancedQueryResult {
    // Similar pattern for rating analysis...
    return this.buildDefaultQuery(config);
  }

  /**
   * Build query for demographic breakdown
   */
  private buildDemographicQuery(config: EnhancedQueryConfig): EnhancedQueryResult {
    // Similar pattern for demographic analysis...
    return this.buildDefaultQuery(config);
  }

  /**
   * Build default query as fallback
   */
  private buildDefaultQuery(config: EnhancedQueryConfig): EnhancedQueryResult {
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

    const demographicSelects = this.getDemographicFieldSelects(surveyId);

    const sql = `
      SELECT sr.id as rid, sa.answer_value, sq.prompt as question_text, sq.type as question_type,
             s.title as survey_title, sq.options as question_options,
             ${demographicSelects}
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
      explanation: 'Enhanced default query: balanced approach with smart demographic field resolution for consistent filtering.',
      expectedResultType: 'mixed',
      demographicFields: ['age_val', 'gender_val', 'location_val', 'occupation_val', 'education_val', 'income_val', 'political_val']
    };
  }

  /**
   * Build WHERE clause for cohort filters with enhanced demographic field support
   */
  private buildCohortWhereClause(rules: CohortFilterRule[], params: any[]): string {
    const clauses: string[] = [];

    for (const rule of rules) {
      // Enhanced field mapping for demographic filters
      let field = rule.field;
      
      // Map legacy field names to our consistent demographic field names
      if (field === 'gender' || field === 'demographics.gender') {
        field = 'gender_val';
      } else if (field === 'age' || field === 'demographics.age' || field === 'age_range') {
        field = 'age_val';
      } else if (field === 'location' || field === 'demographics.location') {
        field = 'location_val';
      } else if (field === 'occupation' || field === 'demographics.occupation') {
        field = 'occupation_val';
      } else if (field === 'education' || field === 'demographics.education') {
        field = 'education_val';
      } else if (field === 'income' || field === 'demographics.income') {
        field = 'income_val';
      } else if (field === 'political_views' || field === 'demographics.politicalViews') {
        field = 'political_val';
      }

      switch (rule.op) {
        case "=":
          clauses.push(`${field} = ?`);
          params.push(rule.value);
          break;
        case "IN":
          if (Array.isArray(rule.value) && rule.value.length) {
            clauses.push(`${field} IN (${rule.value.map(() => "?").join(",")})`);
            params.push(...rule.value);
          }
          break;
        case "CONTAINS":
          // For location arrays like ["Lithuania","Germany +Other Western Europe"]
          if (field === 'location_val') {
            clauses.push(`(${field} LIKE '%${rule.value}%' OR JSON_CONTAINS(${field}, '"${rule.value}"'))`);
          } else {
            clauses.push(`JSON_CONTAINS(${field}, '"${rule.value}"')`);
          }
          break;
      }
    }

    return clauses.length ? clauses.join(" AND ") : "1";
  }
} 