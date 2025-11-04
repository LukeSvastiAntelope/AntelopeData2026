// Simple Statistics Generator - Generates basic SQL queries for survey analysis
import { openSql } from '../database/db';
import {
  profileQuestions,
  isProfileInteresting,
  normalizeQuestionOptions,
  QuestionProfile
} from '../survey/question-profiler';

export interface SimpleStatsConfig {
  maxDistributionQueries?: number;
  maxCrossTabQueries?: number;
  includeTextQuestions?: boolean;
}

export interface QuestionAnalysis {
  id: number;
  prompt: string;
  type: string;
  options: string[];
  detectedType: QuestionProfile['detectedType'];
  category: QuestionProfile['category'];
  demographicField?: string;
  tags: string[];
  priority: number;
  isInteresting: boolean;
}

export interface SimpleStatsQuery {
  id: string;
  type: 'distribution' | 'cross_tab';
  title: string;
  description: string;
  sql: string;
  parameters: any[];
  questionIds: number[];
  expectedChartType: 'bar' | 'pie' | 'heatmap';
}

export interface SimpleStatsResult {
  surveyId: number;
  questions: QuestionAnalysis[];
  queries: SimpleStatsQuery[];
  executedResults: Array<{
    queryId: string;
    data: any[];
    summary: string;
  }>;
  metadata: {
    totalQuestions: number;
    analyzableQuestions: number;
    generatedAt: string;
  };
}

export class SimpleStatsGenerator {
  
  async generateStats(surveyId: number, config: SimpleStatsConfig = {}): Promise<SimpleStatsResult> {
    const maxDistributions = config.maxDistributionQueries || 8;
    const maxCrossTabs = config.maxCrossTabQueries || 5;
    
    console.log(`Generating simple stats for survey ${surveyId}`);
    
    // Get survey questions
    const questions = await this.getSurveyQuestions(surveyId);
    
    // Analyze and categorize questions using shared profiler
    const analyzedQuestions = this.buildQuestionAnalyses(questions);
    const interestingQuestions = analyzedQuestions.filter((q) => q.isInteresting);
    
    // Generate distribution queries
    const distributionQueries = this.generateDistributionQueries(
      interestingQuestions,
      maxDistributions
    );
    
    // Generate cross-tabulation queries
    const crossTabQueries = this.generateCrossTabQueries(
      analyzedQuestions,
      maxCrossTabs
    );
    
    const allQueries = [...distributionQueries, ...crossTabQueries];
    
    // Execute all queries
    const executedResults = await this.executeQueries(surveyId, allQueries);
    
    return {
      surveyId,
      questions: analyzedQuestions,
      queries: allQueries,
      executedResults,
      metadata: {
        totalQuestions: questions.length,
        analyzableQuestions: interestingQuestions.length,
        generatedAt: new Date().toISOString()
      }
    };
  }
  
  private async getSurveyQuestions(surveyId: number): Promise<any[]> {
    const db = await openSql();
    
    const [questions] = await db.execute(`
      SELECT 
        id,
        prompt,
        type,
        options,
        question_order,
        is_required
      FROM survey_questions 
      WHERE survey_id = ?
      ORDER BY question_order ASC
    `, [surveyId]) as any[];
    
    return questions.map((q: any) => ({
      ...q,
      options: normalizeQuestionOptions(q.options)
    }));
  }

  private buildQuestionAnalyses(questions: any[]): QuestionAnalysis[] {
    const profiles = profileQuestions(questions);
    return profiles.map((profile) => ({
      id: profile.id,
      prompt: profile.prompt,
      type: profile.rawType,
      options: profile.options,
      detectedType: profile.detectedType,
      category: profile.category,
      demographicField: profile.demographicField,
      tags: profile.tags,
      priority: profile.priority,
      isInteresting: isProfileInteresting(profile)
    }));
  }
  
  private generateDistributionQueries(questions: QuestionAnalysis[], maxQueries: number): SimpleStatsQuery[] {
    // Sort by priority and take top questions
    const topQuestions = [...questions]
      .sort((a, b) => b.priority - a.priority)
      .slice(0, maxQueries);
    
    return topQuestions.map((q, index) => ({
      id: `dist_${q.id}`,
      type: 'distribution',
      title: `Distribution: ${this.truncateText(q.prompt, 150)}`,
      description: `Response distribution for "${q.prompt}"`,
      sql: `
        SELECT 
          COALESCE(CAST(answer_code AS CHAR), answer_value) AS answer_value, 
          COUNT(*) as count,
          ROUND(COUNT(*) * 100.0 / (
            SELECT COUNT(*) 
            FROM survey_answers 
            WHERE question_id = ? AND answer_value IS NOT NULL AND answer_value != ''
          ), 1) as percentage
        FROM survey_answers sa
        WHERE sa.question_id = ? 
          AND sa.answer_value IS NOT NULL 
          AND sa.answer_value != ''
        GROUP BY COALESCE(CAST(sa.answer_code AS CHAR), sa.answer_value) 
        ORDER BY count DESC
      `,
      parameters: [q.id, q.id],
      questionIds: [q.id],
      expectedChartType: q.detectedType === 'yes_no' ? 'pie' : 'bar'
    }));
  }
  
  private generateCrossTabQueries(questions: QuestionAnalysis[], maxQueries: number): SimpleStatsQuery[] {
    const crossTabs: SimpleStatsQuery[] = [];
    
    // Find demographic-like questions (shorter options, basic categories)
    const demographicQuestions = questions
      .filter(
        (q) =>
          q.category === 'demographic' &&
          q.options.length > 0 &&
          q.options.length <= 8
      )
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 4);
    
    // Find opinion or behavioral questions with structured responses
    const opinionQuestions = questions
      .filter(
        (q) =>
          (q.category === 'opinion' || q.category === 'behavioral') &&
          q.isInteresting
      )
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 6);
    
    let generated = 0;
    
    // Generate cross-tabs between demographics and opinions
    for (const demo of demographicQuestions.slice(0, 3)) {
      for (const opinion of opinionQuestions.slice(0, 2)) {
        if (generated >= maxQueries) break;
        
        crossTabs.push({
          id: `cross_${demo.id}_${opinion.id}`,
          type: 'cross_tab',
          title: `${this.truncateText(demo.prompt, 75)} × ${this.truncateText(opinion.prompt, 75)}`,
          description: `Cross-tabulation between "${demo.prompt}" and "${opinion.prompt}"`,
          sql: `
            SELECT 
              COALESCE(CAST(a1.answer_code AS CHAR), a1.answer_value) as demo_answer,
              COALESCE(CAST(a2.answer_code AS CHAR), a2.answer_value) as opinion_answer,
              COUNT(*) as count,
              ROUND(COUNT(*) * 100.0 / (
                SELECT COUNT(*) 
                FROM survey_answers sa1 
                JOIN survey_answers sa2 ON sa1.response_id = sa2.response_id
                WHERE sa1.question_id = ? AND sa2.question_id = ?
                  AND sa1.answer_value IS NOT NULL AND sa1.answer_value != ''
                  AND sa2.answer_value IS NOT NULL AND sa2.answer_value != ''
              ), 1) as percentage
            FROM survey_answers a1
            JOIN survey_answers a2 ON a1.response_id = a2.response_id
            WHERE a1.question_id = ? AND a2.question_id = ?
              AND a1.answer_value IS NOT NULL AND a1.answer_value != ''
              AND a2.answer_value IS NOT NULL AND a2.answer_value != ''
            GROUP BY 
              COALESCE(CAST(a1.answer_code AS CHAR), a1.answer_value),
              COALESCE(CAST(a2.answer_code AS CHAR), a2.answer_value)
            HAVING count >= 5
            ORDER BY count DESC
            LIMIT 20
          `,
          parameters: [demo.id, opinion.id, demo.id, opinion.id],
          questionIds: [demo.id, opinion.id],
          expectedChartType: 'heatmap'
        });
        
        generated++;
      }
      if (generated >= maxQueries) break;
    }
    
    return crossTabs;
  }
  
  private async executeQueries(surveyId: number, queries: SimpleStatsQuery[]): Promise<Array<{queryId: string; data: any[]; summary: string}>> {
    const db = await openSql();
    const results: Array<{queryId: string; data: any[]; summary: string}> = [];
    
    for (const query of queries) {
      try {
        console.log(`Executing ${query.type} query: ${query.title}`);
        
        const [data] = await db.execute(query.sql, query.parameters) as any[];
        
        // Post-process cross-tab data to map numeric values to text labels
        let processedData = data;
        if (query.type === 'cross_tab') {
          processedData = await this.mapCrossTabLabels(db, data, query.questionIds);
        } else if (query.type === 'distribution') {
          processedData = await this.mapDistributionLabels(db, data, query.questionIds[0]);
        }
        
        const summary = this.generateQuerySummary(query, processedData);
        
        results.push({
          queryId: query.id,
          data: processedData,
          summary: summary
        });
        
        console.log(`Query ${query.id} returned ${data.length} rows`);
        
      } catch (error) {
        console.error(`Error executing query ${query.id}:`, error);
        results.push({
          queryId: query.id,
          data: [],
          summary: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
      }
    }
    
    // Do not close the shared connection pool here; it is reused elsewhere in the application
    return results;
  }

  private async mapCrossTabLabels(db: any, data: any[], questionIds: number[]): Promise<any[]> {
    if (questionIds.length < 2) return data;

    // Get options for both questions
    const [q1Options] = await db.execute(
      'SELECT options FROM survey_questions WHERE id = ?',
      [questionIds[0]]
    ) as any[];

    const [q2Options] = await db.execute(
      'SELECT options FROM survey_questions WHERE id = ?',
      [questionIds[1]]
    ) as any[];

    const q1OptionsArray = normalizeQuestionOptions(q1Options[0]?.options || '');
    const q2OptionsArray = normalizeQuestionOptions(q2Options[0]?.options || '');

    // Map numeric values to text labels (non-numeric values are passed through)
    const mapped = data.map((row: any) => ({
      ...row,
      demo_answer: this.getOptionText(row.demo_answer, q1OptionsArray),
      opinion_answer: this.getOptionText(row.opinion_answer, q2OptionsArray)
    }));

    // Remove rows where mapping failed and answers remain raw numeric codes (likely not useful for display)
    const cleaned = mapped.filter((row: any) => {
      const isDemoNumeric = /^\d+$/.test(row.demo_answer);
      const isOpinionNumeric = /^\d+$/.test(row.opinion_answer);
      return !(isDemoNumeric || isOpinionNumeric);
    });

    return cleaned;
  }

  private async mapDistributionLabels(db: any, data: any[], questionId: number): Promise<any[]> {
    if (!questionId) return data;

    const [optionsRow] = await db.execute('SELECT options FROM survey_questions WHERE id = ?', [questionId]) as any[];
    const optionsArray = normalizeQuestionOptions(optionsRow[0]?.options || '');

    const mapped = data.map((row: any) => ({
      ...row,
      answer_value: this.getOptionText(row.answer_value, optionsArray)
    }));

    return mapped.filter((row: any) => !/^\d+$/.test(row.answer_value));
  }

  private getOptionText(value: string, options: string[]): string {
    const numericValue = parseInt(value);
    if (!isNaN(numericValue) && numericValue >= 1 && numericValue <= options.length) {
      // Map numeric codes to option text
      return options[numericValue - 1] || value;
    }
    return value; // Return original value if it's already text or mapping failed
  }

  private generateQuerySummary(query: SimpleStatsQuery, data: any[]): string {
    if (data.length === 0) {
      return `No data found for ${query.title}`;
    }
    
    if (query.type === 'distribution') {
      const total = data.reduce((sum, row) => sum + (row.count || 0), 0);
      const topAnswer = data[0];
      return `${total} total responses. Top answer: "${topAnswer.answer_value}" (${topAnswer.percentage}%)`;
    } else {
      const total = data.reduce((sum, row) => sum + (row.count || 0), 0);
      return `${total} total response combinations across ${data.length} unique combinations`;
    }
  }
  
  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }
} 
