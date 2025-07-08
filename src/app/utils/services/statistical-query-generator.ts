// Statistical Query Generator - Generates SQL queries for statistical analysis based on survey metadata
import { openSql } from '../database/db';
import { createCompletion } from './ai-service';

export interface StatisticalAnalysisConfig {
  analysisModel?: string;
  forceRegenerate?: boolean;
  cacheExpirationHours?: number;
}

export interface StatisticalQueryResult {
  analysisType: 'distribution' | 'cross_tabulation' | 'correlation' | 'segmentation';
  query: string;
  parameters: any[];
  resultStructure: {
    columns: Array<{ name: string; type: string; description: string }>;
    expectedRowCount: number;
    statisticalTests: string[];
  };
  metadata: {
    questionIds: string[];
    analysisDescription: string;
    businessRelevance: string;
    statisticalSignificance: boolean;
    minimumSampleSize: number;
  };
}

export class StatisticalQueryGenerator {
  private defaultModel: string;
  private defaultCacheHours: number;

  constructor(
    defaultModel: string = 'gpt-4o-mini', // Fast model for SQL generation
    defaultCacheHours: number = 24
  ) {
    this.defaultModel = defaultModel;
    this.defaultCacheHours = defaultCacheHours;
  }

  async generateAnalysisQueries(
    surveyId: number, 
    analysisMetadata: any,
    config: StatisticalAnalysisConfig = {}
  ): Promise<StatisticalQueryResult[]> {
    const model = config.analysisModel || this.defaultModel;
    const cacheHours = config.cacheExpirationHours || this.defaultCacheHours;

    // Check for cached results unless force regenerate
    if (!config.forceRegenerate) {
      const cached = await this.getCachedResults(surveyId, cacheHours);
      if (cached.length > 0) {
        console.log(`Using ${cached.length} cached statistical queries for survey ${surveyId}`);
        return cached;
      }
    }

    // Get survey schema and sample data
    const surveySchema = await this.getSurveySchema(surveyId);
    
    // Generate queries using AI
    const queries = await this.generateQueriesWithAI(surveyId, analysisMetadata, surveySchema, model);
    
    // Cache the results
    await this.cacheResults(surveyId, queries);
    
    // After parsing queries from AI
    // Sanitize correlation queries to avoid ambiguous column and text aggregation issues
    queries.forEach((q: any) => {
      if (q.analysisType === 'correlation' && typeof q.query === 'string') {
        q.query = this.sanitizeCorrelationQuery(q.query);
      }
    });
    
    return queries;
  }

  private async generateQueriesWithAI(
    surveyId: number,
    analysisMetadata: any,
    surveySchema: any,
    model: string
  ): Promise<StatisticalQueryResult[]> {
    const systemPrompt = `You are a statistical analysis expert specializing in survey data. Generate SQL queries for meaningful statistical analysis.

Your task is to create optimized MySQL queries that will produce actionable insights from survey data.

CRITICAL FORMATTING REQUIREMENTS:
- Return ONLY valid JSON with no additional text, explanations, or markdown formatting
- ALL property names must be in double quotes
- ALL string values must be in double quotes  
- Use proper JSON syntax with commas and brackets
- Do not include any trailing commas
- Ensure the response is a valid JSON array

CRITICAL: Return ONLY valid JSON with no additional text, explanations, or markdown formatting.`;

    const userPrompt = `Generate statistical analysis queries for this survey:

**Survey Analysis Context:**
- Survey ID: ${surveyId}
- Survey Type: ${analysisMetadata.surveyType}
- Main Themes: ${analysisMetadata.mainThemes?.join(', ')}
- Total Responses: ${surveySchema.responseCount}

**Database Schema:**
${this.formatSchemaForPrompt(surveySchema)}

**Analysis Requirements:**
Based on the survey understanding, generate 4-8 SQL queries covering:

1. **Distribution Analysis**: Key metrics and response distributions
2. **Cross-tabulation**: Demographic breakdowns of key variables  
3. **Correlation Analysis**: Relationships between related questions
4. **Segmentation**: Meaningful respondent groupings

**Response Format:**
Return a JSON array of query objects with this exact structure:
[
  {
    "analysisType": "distribution|cross_tabulation|correlation|segmentation",
    "query": "SELECT statement with proper MySQL syntax",
    "parameters": [array_of_parameter_values],
    "resultStructure": {
      "columns": [
        {"name": "column_name", "type": "VARCHAR|INT|DECIMAL|etc", "description": "what this column represents"}
      ],
      "expectedRowCount": estimated_number_of_rows,
      "statisticalTests": ["chi_square", "t_test", "correlation", etc]
    },
    "metadata": {
      "questionIds": ["question_ids_being_analyzed"],
      "analysisDescription": "What this analysis reveals",
      "businessRelevance": "Why this matters for decision making",
      "statisticalSignificance": true_or_false,
      "minimumSampleSize": required_sample_size
    }
  }
]

**Requirements:**
- Use proper MySQL syntax with parameterized queries
- Include statistical significance testing where appropriate
- Focus on actionable business insights
- Ensure queries are optimized for performance
- Use actual column names from the schema
- Include confidence intervals and effect sizes where relevant`;

    console.log(`Generating statistical queries for survey ${surveyId} with model: ${model}`);
    
    const response = await createCompletion({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.2, // Lower temperature for more consistent SQL
      maxTokens: 6000
    });

    let queries: StatisticalQueryResult[];
    try {
      // Clean up common JSON formatting issues from AI responses
      let cleanedContent = response.content;
      
      // Fix missing quotes around property names and string values
      cleanedContent = cleanedContent.replace(/(\w+):/g, '"$1":'); // Add quotes around property names
      cleanedContent = cleanedContent.replace(/:\s*([A-Za-z][A-Za-z0-9\s]+)(?=,|\})/g, ': "$1"'); // Add quotes around unquoted string values
      cleanedContent = cleanedContent.replace(/type:\s*VARCHAR/g, '"type": "VARCHAR"'); // Fix specific cases
      cleanedContent = cleanedContent.replace(/type:\s*INT/g, '"type": "INT"');
      cleanedContent = cleanedContent.replace(/description:\s*([^,}]+)/g, '"description": "$1"');
      
      queries = JSON.parse(cleanedContent);
    } catch (error) {
      console.error('Failed to parse AI query response:', response.content);
      console.error('Parse error:', error);
      
      // Fallback: try to extract just the valid parts or create minimal queries
      try {
        // Extract the first valid query objects if possible
        const validPortion = response.content.substring(0, response.content.lastIndexOf('},') + 1) + ']';
        queries = JSON.parse(validPortion);
        console.log('Successfully parsed partial response with', queries.length, 'queries');
      } catch (fallbackError) {
        console.error('Both JSON parsing attempts failed. Generating fallback queries.');
        
        // Generate basic fallback queries
        queries = this.generateFallbackQueries(surveyId, surveySchema);
      }
    }

    // Validate queries
    if (!Array.isArray(queries) || queries.length === 0) {
      throw new Error('AI did not return valid query array');
    }

    return queries;
  }

  private formatSchemaForPrompt(schema: any): string {
    let schemaText = `**Tables:**\n`;
    
    schemaText += `- survey_responses (${schema.responseCount} rows)\n`;
    schemaText += `- survey_questions (${schema.questions.length} questions)\n`;
    schemaText += `- survey_questions.options (JSON field with multiple choice options)\n\n`;
    
    schemaText += `**Key Columns:**\n`;
    schemaText += `- survey_responses.id, survey_responses.survey_id, survey_responses.created_at\n`;
    schemaText += `- survey_questions.id, survey_questions.prompt, survey_questions.type, survey_questions.options\n`;
    schemaText += `- survey_answers.question_id, survey_answers.response_id, survey_answers.answer_value\n\n`;
    
    schemaText += `**Questions Available:**\n`;
    schema.questions.forEach((q: any, i: number) => {
      schemaText += `${i + 1}. ${q.prompt} (ID: ${q.id}, Type: ${q.type})\n`;
      if (q.options && q.options.length > 0) {
        schemaText += `   Options: ${q.options.map((opt: string) => `"${opt}"`).join(', ')}\n`;
      }
    });
    
    return schemaText;
  }

  async executeQuery(query: StatisticalQueryResult): Promise<any[]> {
    const db = await openSql();
    
    try {
      console.log(`Executing ${query.analysisType} query:`, query.query);
      
      const [results] = await db.execute(query.query, query.parameters) as any[];
      
      console.log(`Query returned ${Array.isArray(results) ? results.length : 0} rows`);
      
      return Array.isArray(results) ? results : [];
      
    } catch (error) {
      console.error(`Error executing statistical query:`, error);
      throw new Error(`Failed to execute ${query.analysisType} analysis: ${error}`);
    }
  }

  private async getSurveySchema(surveyId: number) {
    const db = await openSql();
    
    // Get survey info
    const [survey] = await db.execute(
      'SELECT * FROM surveys WHERE id = ?',
      [surveyId]
    ) as any[];

    if (!survey || survey.length === 0) {
      throw new Error(`Survey ${surveyId} not found`);
    }

    // Get questions with options (stored as JSON in the options column)
    const [questions] = await db.execute(`
      SELECT 
        id,
        survey_id,
        type,
        prompt,
        options,
        is_required,
        question_order,
        created_at
      FROM survey_questions 
      WHERE survey_id = ?
      ORDER BY question_order ASC
    `, [surveyId]) as any[];

    // Parse options JSON if it exists
    const questionsWithOptions = questions.map((q: any) => ({
      ...q,
      options: q.options ? (Array.isArray(q.options) ? q.options : JSON.parse(q.options)) : []
    }));

    // Get response count
    const [responseCount] = await db.execute(
      'SELECT COUNT(*) as count FROM survey_responses WHERE survey_id = ?',
      [surveyId]
    ) as any[];

    return {
      survey: survey[0],
      questions: questionsWithOptions,
      responseCount: responseCount[0]?.count || 0
    };
  }

  private async getCachedResults(surveyId: number, cacheHours: number): Promise<StatisticalQueryResult[]> {
    const db = await openSql();
    
    // Check for cached queries in the new simplified table
    const [cached] = await db.execute(`
      SELECT analytics_data 
      FROM survey_analytics_cache 
      WHERE survey_id = ? 
        AND status = 'completed'
        AND JSON_EXTRACT(analytics_data, '$.queries') IS NOT NULL
        AND created_at > DATE_SUB(NOW(), INTERVAL ? HOUR)
      ORDER BY created_at DESC
      LIMIT 1
    `, [surveyId, cacheHours]) as any[];

    if (!cached || cached.length === 0) {
      return [];
    }

    try {
      const analyticsData = cached[0].analytics_data;
      const fullResult = typeof analyticsData === 'string' ? JSON.parse(analyticsData) : analyticsData;
      
      // Extract the queries portion
      return fullResult.queries || [];
    } catch (error) {
      console.error('Error parsing cached queries:', error);
      return [];
    }
  }

  private async cacheResults(surveyId: number, queries: StatisticalQueryResult[]): Promise<void> {
    // Queries will be stored as part of the complete result by the orchestrator
    // This method is now a no-op since we use centralized storage
    console.log(`Generated ${queries.length} queries for survey ${surveyId} - will be stored by orchestrator`);
  }

  private generateFallbackQueries(surveyId: number, surveySchema: any): StatisticalQueryResult[] {
    const queries: StatisticalQueryResult[] = [];
    
    // Basic response count query
    queries.push({
      analysisType: 'distribution',
      query: 'SELECT COUNT(*) as total_responses FROM survey_responses WHERE survey_id = ?',
      parameters: [surveyId],
      resultStructure: {
        columns: [
          { name: 'total_responses', type: 'INT', description: 'Total number of survey responses' }
        ],
        expectedRowCount: 1,
        statisticalTests: []
      },
      metadata: {
        questionIds: [],
        analysisDescription: 'Total survey response count',
        businessRelevance: 'Understanding response volume for data reliability',
        statisticalSignificance: false,
        minimumSampleSize: 1
      }
    });
    
    // If we have questions, add a basic distribution query for the first few
    if (surveySchema.questions && surveySchema.questions.length > 0) {
      const firstQuestion = surveySchema.questions[0];
      queries.push({
        analysisType: 'distribution',
        query: 'SELECT answer_value, COUNT(*) as response_count FROM survey_answers WHERE question_id = ? GROUP BY answer_value ORDER BY response_count DESC',
        parameters: [firstQuestion.id],
        resultStructure: {
          columns: [
            { name: 'answer_value', type: 'VARCHAR', description: 'Response value' },
            { name: 'response_count', type: 'INT', description: 'Number of responses' }
          ],
          expectedRowCount: 10,
          statisticalTests: []
        },
        metadata: {
          questionIds: [firstQuestion.id.toString()],
          analysisDescription: `Distribution of responses for: ${firstQuestion.prompt}`,
          businessRelevance: 'Understanding response patterns for key survey question',
          statisticalSignificance: false,
          minimumSampleSize: 10
        }
      });
    }
    
    console.log(`Generated ${queries.length} fallback queries for survey ${surveyId}`);
    return queries;
  }

  /**
   * Replace ambiguous AVG(answer_value) with qualified and CASTed versions
   */
  private sanitizeCorrelationQuery(query: string): string {
    let sanitized = query;
    // Qualify ambiguous answer_value references and cast to numeric
    sanitized = sanitized.replace(/AVG\(\s*answer_value\s*\)/gi, 'AVG(CAST(a.answer_value AS DECIMAL(10,2)))');
    sanitized = sanitized.replace(/AVG\(\s*b\.answer_value\s*\)/gi, 'AVG(CAST(b.answer_value AS DECIMAL(10,2)))');
    return sanitized;
  }
} 