/**
 * Smart SQL Query Builder for Targeted Survey Data Loading
 * 
 * This utility generates optimized SQL queries based on semantic analysis
 * of user questions, dramatically reducing data transfer and token usage.
 */

export interface QueryFilter {
  column: string;
  operator: 'equals' | 'in' | 'not_in' | 'contains' | 'greater_than' | 'less_than' | 'between' | 'is_null' | 'is_not_null';
  value: any;
  logicalOperator?: 'AND' | 'OR';
}

export interface TargetedQueryParams {
  surveyId: number;
  selectedQuestions: string[]; // Question variable names like 'Q1', 'Q2'
  includeDemographics: boolean;
  filters?: QueryFilter[];
  limit?: number;
  offset?: number;
  orderBy?: {
    column: string;
    direction: 'ASC' | 'DESC';
  };
  groupBy?: string[];
  having?: QueryFilter[];
  sampleSize?: number; // For large datasets, return random sample
}

export interface QueryResult {
  sql: string;
  params: any[];
  estimatedRows: number;
  performance: {
    columnsSelected: number;
    totalAvailableColumns: number;
    reductionPercentage: number;
    estimatedTokenSaving: number;
  };
}

export class TargetedQueryBuilder {
  private static readonly DEMOGRAPHIC_COLUMNS = [
    'demo_age',
    'demo_gender', 
    'demo_location',
    'demo_education',
    'demo_maritalStatus',
    'demo_race',
    'demo_ethnicity',
    'demo_income',
    'demo_employment'
  ];

  private static readonly BASE_COLUMNS = [
    'response_id',
    'submitted_at'
  ];

  /**
   * Build optimized SQL query for targeted survey data loading
   */
  static buildTargetedQuery(params: TargetedQueryParams): QueryResult {
    const {
      surveyId,
      selectedQuestions,
      includeDemographics = true,
      filters = [],
      limit,
      offset,
      orderBy,
      groupBy,
      having = [],
      sampleSize
    } = params;

    console.log('🔧 Building targeted query:', {
      surveyId,
      selectedQuestions: selectedQuestions.length,
      includeDemographics,
      filters: filters.length
    });

    // Calculate columns to include
    const columns = this.buildColumnList(selectedQuestions, includeDemographics);
    const totalAvailableColumns = 112 + this.BASE_COLUMNS.length + this.DEMOGRAPHIC_COLUMNS.length; // Approximate
    
    // Build main query components
    const selectClause = this.buildSelectClause(columns);
    const fromClause = this.buildFromClause(surveyId, selectedQuestions);
    const whereClause = this.buildWhereClause(filters);
    const groupByClause = groupBy ? this.buildGroupByClause(groupBy) : '';
    const havingClause = having.length > 0 ? this.buildHavingClause(having) : '';
    const orderByClause = orderBy ? this.buildOrderByClause(orderBy) : '';
    const limitClause = this.buildLimitClause(limit, offset, sampleSize);

    // Assemble final query
    const sql = [
      selectClause,
      fromClause,
      whereClause,
      groupByClause,
      havingClause,
      orderByClause,
      limitClause
    ].filter(clause => clause.length > 0).join('\n');

    // Extract parameters for prepared statement
    const sqlParams = this.extractParameters(filters, having, surveyId, selectedQuestions);

    // Calculate performance metrics
    const reductionPercentage = Math.round((1 - columns.length / totalAvailableColumns) * 100);
    const estimatedTokenSaving = Math.round(reductionPercentage * 0.8); // Rough estimate

    const result: QueryResult = {
      sql,
      params: sqlParams,
      estimatedRows: this.estimateRowCount(limit, sampleSize),
      performance: {
        columnsSelected: columns.length,
        totalAvailableColumns,
        reductionPercentage,
        estimatedTokenSaving
      }
    };

    console.log('🔧 Query built successfully:', {
      columnsSelected: result.performance.columnsSelected,
      reductionPercentage: result.performance.reductionPercentage + '%',
      estimatedTokenSaving: result.performance.estimatedTokenSaving + '%'
    });

    return result;
  }

  /**
   * Build aggregated statistics query for dashboard insights
   */
  static buildStatsQuery(params: TargetedQueryParams): QueryResult {
    const { surveyId, selectedQuestions, includeDemographics } = params;
    
    const statsColumns = selectedQuestions.map(q => `
      COUNT(CASE WHEN \`${q}\` IS NOT NULL THEN 1 END) as ${q}_count,
      COUNT(CASE WHEN \`${q}\` IS NOT NULL THEN 1 END) * 100.0 / COUNT(*) as ${q}_response_rate
    `).join(',');

    const sql = `
      SELECT 
        COUNT(*) as total_responses,
        ${statsColumns}
        ${includeDemographics ? ',\n' + this.buildDemographicStats() : ''}
      FROM (${this.buildFromClause(surveyId, selectedQuestions, false)}) as data
    `;

    return {
      sql,
      params: [surveyId, ...selectedQuestions.map(q => parseInt(q.replace('Q', '')))],
      estimatedRows: 1,
      performance: {
        columnsSelected: selectedQuestions.length * 2,
        totalAvailableColumns: selectedQuestions.length * 2,
        reductionPercentage: 0,
        estimatedTokenSaving: 95 // Stats queries are very efficient
      }
    };
  }

  private static buildColumnList(selectedQuestions: string[], includeDemographics: boolean): string[] {
    const columns = [...this.BASE_COLUMNS];
    
    if (includeDemographics) {
      columns.push(...this.DEMOGRAPHIC_COLUMNS);
    }
    
    columns.push(...selectedQuestions);
    
    return columns;
  }

  private static buildSelectClause(columns: string[]): string {
    const formattedColumns = columns.map(col => `\`${col}\``).join(',\n    ');
    return `SELECT\n    ${formattedColumns}`;
  }

  private static buildFromClause(surveyId: number, selectedQuestions: string[], includeLimit: boolean = true): string {
    const questionSelectors = selectedQuestions.map((q, i) => {
      const questionOrder = parseInt(q.replace('Q', ''));
      return `MAX(CASE WHEN q.question_order = ? THEN a.answer_value END) as \`${q}\``;
    }).join(',\n        ');

    return `FROM (
      SELECT 
        sr.id as response_id,
        sr.submitted_at,
        JSON_UNQUOTE(JSON_EXTRACT(sr.demographics, '$.age')) as demo_age,
        JSON_UNQUOTE(JSON_EXTRACT(sr.demographics, '$.gender')) as demo_gender,
        JSON_UNQUOTE(JSON_EXTRACT(sr.demographics, '$.location')) as demo_location,
        JSON_UNQUOTE(JSON_EXTRACT(sr.demographics, '$.education')) as demo_education,
        JSON_UNQUOTE(JSON_EXTRACT(sr.demographics, '$.maritalStatus')) as demo_maritalStatus,
        JSON_UNQUOTE(JSON_EXTRACT(sr.demographics, '$.race')) as demo_race,
        JSON_UNQUOTE(JSON_EXTRACT(sr.demographics, '$.ethnicity')) as demo_ethnicity,
        JSON_UNQUOTE(JSON_EXTRACT(sr.demographics, '$.income')) as demo_income,
        JSON_UNQUOTE(JSON_EXTRACT(sr.demographics, '$.employment')) as demo_employment,
        ${questionSelectors}
      FROM survey_responses sr
      JOIN survey_answers a ON sr.id = a.response_id
      JOIN survey_questions q ON a.question_id = q.id
      WHERE sr.survey_id = ?
      GROUP BY sr.id, sr.submitted_at, sr.demographics
      HAVING COUNT(DISTINCT q.id) >= ?
    ) as survey_data`;
  }

  private static buildWhereClause(filters: QueryFilter[]): string {
    if (filters.length === 0) return '';

    const conditions = filters.map((filter, index) => {
      const condition = this.buildFilterCondition(filter);
      const logicalOp = index > 0 ? (filter.logicalOperator || 'AND') : '';
      return index > 0 ? `${logicalOp} ${condition}` : condition;
    });

    return `WHERE ${conditions.join(' ')}`;
  }

  private static buildFilterCondition(filter: QueryFilter): string {
    const { column, operator, value } = filter;
    const col = `\`${column}\``;

    switch (operator) {
      case 'equals':
        return `${col} = ?`;
      case 'in':
        const placeholders = Array.isArray(value) ? value.map(() => '?').join(',') : '?';
        return `${col} IN (${placeholders})`;
      case 'not_in':
        const notPlaceholders = Array.isArray(value) ? value.map(() => '?').join(',') : '?';
        return `${col} NOT IN (${notPlaceholders})`;
      case 'contains':
        return `${col} LIKE ?`;
      case 'greater_than':
        return `${col} > ?`;
      case 'less_than':
        return `${col} < ?`;
      case 'between':
        return `${col} BETWEEN ? AND ?`;
      case 'is_null':
        return `${col} IS NULL`;
      case 'is_not_null':
        return `${col} IS NOT NULL`;
      default:
        return `${col} = ?`;
    }
  }

  private static buildGroupByClause(groupBy: string[]): string {
    const columns = groupBy.map(col => `\`${col}\``).join(', ');
    return `GROUP BY ${columns}`;
  }

  private static buildHavingClause(having: QueryFilter[]): string {
    if (having.length === 0) return '';

    const conditions = having.map((filter, index) => {
      const condition = this.buildFilterCondition(filter);
      const logicalOp = index > 0 ? (filter.logicalOperator || 'AND') : '';
      return index > 0 ? `${logicalOp} ${condition}` : condition;
    });

    return `HAVING ${conditions.join(' ')}`;
  }

  private static buildOrderByClause(orderBy: { column: string; direction: 'ASC' | 'DESC' }): string {
    return `ORDER BY \`${orderBy.column}\` ${orderBy.direction}`;
  }

  private static buildLimitClause(limit?: number, offset?: number, sampleSize?: number): string {
    if (sampleSize) {
      // Use MySQL's TABLESAMPLE for large datasets (if supported) or ORDER BY RAND()
      const limitClause = limit ? `LIMIT ${limit}` : 'LIMIT 10000';
      return `ORDER BY RAND() ${limitClause}`;
    }

    if (limit) {
      const offsetClause = offset ? `OFFSET ${offset}` : '';
      return `LIMIT ${limit} ${offsetClause}`.trim();
    }

    return '';
  }

  private static buildDemographicStats(): string {
    return this.DEMOGRAPHIC_COLUMNS.map(demo => `
      COUNT(DISTINCT \`${demo}\`) as ${demo}_unique_values,
      COUNT(CASE WHEN \`${demo}\` IS NOT NULL THEN 1 END) as ${demo}_non_null_count
    `).join(',');
  }

  private static extractParameters(filters: QueryFilter[], having: QueryFilter[], surveyId: number, selectedQuestions: string[]): any[] {
    const params: any[] = [];

    // Add parameters for question selectors in FROM clause
    selectedQuestions.forEach(q => {
      const questionOrder = parseInt(q.replace('Q', ''));
      params.push(questionOrder);
    });

    // Add survey ID
    params.push(surveyId);

    // Add minimum questions requirement
    params.push(Math.min(3, selectedQuestions.length));

    // Add parameters for WHERE clause filters
    filters.forEach(filter => {
      if (filter.operator === 'contains') {
        params.push(`%${filter.value}%`);
      } else if (filter.operator === 'between') {
        params.push(filter.value[0], filter.value[1]);
      } else if (filter.operator === 'in' || filter.operator === 'not_in') {
        if (Array.isArray(filter.value)) {
          params.push(...filter.value);
        } else {
          params.push(filter.value);
        }
      } else if (filter.operator !== 'is_null' && filter.operator !== 'is_not_null') {
        params.push(filter.value);
      }
    });

    // Add parameters for HAVING clause filters
    having.forEach(filter => {
      if (filter.operator === 'contains') {
        params.push(`%${filter.value}%`);
      } else if (filter.operator === 'between') {
        params.push(filter.value[0], filter.value[1]);
      } else if (filter.operator === 'in' || filter.operator === 'not_in') {
        if (Array.isArray(filter.value)) {
          params.push(...filter.value);
        } else {
          params.push(filter.value);
        }
      } else if (filter.operator !== 'is_null' && filter.operator !== 'is_not_null') {
        params.push(filter.value);
      }
    });

    return params;
  }

  private static estimateRowCount(limit?: number, sampleSize?: number): number {
    if (limit) return limit;
    if (sampleSize) return sampleSize;
    return 10000; // Default limit
  }

  /**
   * Generate optimized query for correlation analysis
   */
  static buildCorrelationQuery(surveyId: number, variables: string[]): QueryResult {
    return this.buildTargetedQuery({
      surveyId,
      selectedQuestions: variables,
      includeDemographics: true,
      filters: variables.map(v => ({
        column: v,
        operator: 'is_not_null',
        value: null
      }))
    });
  }

  /**
   * Generate optimized query for demographic breakdown
   */
  static buildDemographicBreakdownQuery(surveyId: number, targetQuestion: string, demographic: string): QueryResult {
    return this.buildTargetedQuery({
      surveyId,
      selectedQuestions: [targetQuestion],
      includeDemographics: true,
      filters: [
        { column: targetQuestion, operator: 'is_not_null', value: null },
        { column: demographic, operator: 'is_not_null', value: null }
      ],
      groupBy: [demographic, targetQuestion]
    });
  }
}