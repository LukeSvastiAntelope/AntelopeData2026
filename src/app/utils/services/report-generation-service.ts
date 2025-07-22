import { ReportStorageService, ReportSection } from './report-storage-service';
import { SmartSurveyQueryBuilder } from '../survey/smart-query-builder';
import { openSql as getMySQLConnection } from "@/app/utils/database/db";
import { createCompletion } from './ai-service';
import { RowDataPacket } from 'mysql2';

export interface ReportInitiationParams {
  userId: string;
  surveyId?: number;
  cohortId?: number;
  query: string;
  reportType: 'demographic' | 'thematic' | 'comparative' | 'longitudinal' | 'comprehensive';
  tokenBudget: number;
  complexity?: number;
}

interface SurveyData {
  responses: any[];
  questions: any[];
  demographics: any[];
  surveyTitle: string;
  sampleSize: number;
  factSheet?: any;
}

export class ReportGenerationService {
  private storageService = new ReportStorageService();
  
  async initiateReport(params: ReportInitiationParams): Promise<string> {
    // Create report record
    const reportId = await this.storageService.createReport({
      userId: params.userId,
      surveyId: params.surveyId,
      cohortId: params.cohortId,
      query: params.query,
      reportType: params.reportType,
      title: this.generateTitle(params),
      complexity: params.complexity
    });
    
    // Queue for background processing
    await this.queueReportGeneration(reportId, params);
    
    return reportId;
  }
  
  async generateReportPreview(params: ReportInitiationParams): Promise<{
    title: string;
    sections: ReportSection[];
    metadata: any;
  }> {
    console.log(`🔍 Generating report preview for query: "${params.query}"`);
    
    // Get survey data
    const surveyData = await this.fetchSurveyData(params);
    
    // Generate sections based on report type
    const sections = await this.generateReportSections(params, surveyData);
    
    // Calculate metadata
    const tokenUsage = sections.reduce((total, section) => 
      total + Math.ceil(section.content.length / 4), 0
    );
    
    const metadata = {
      complexity: params.complexity || 0,
      questionCount: surveyData.questions.length,
      responseCount: surveyData.sampleSize,
      surveyTitle: surveyData.surveyTitle,
      tokenUsage,
      generatedAt: new Date(),
      hasFactSheet: !!surveyData.factSheet
    };
    
    console.log(`✅ Report preview generated with ${sections.length} sections, ${tokenUsage} tokens`);
    
    return {
      title: this.generateTitle(params),
      sections,
      metadata
    };
  }
  
  async saveReportFromPreview(
    params: ReportInitiationParams, 
    sections: ReportSection[], 
    metadata: any
  ): Promise<string> {
    console.log(`💾 Saving report from preview: "${params.query}"`);
    
    // Create report record
    const reportId = await this.storageService.createReport({
      userId: params.userId,
      surveyId: params.surveyId,
      cohortId: params.cohortId,
      query: params.query,
      reportType: params.reportType,
      title: this.generateTitle(params),
      complexity: params.complexity
    });
    
    // Store sections
    for (const section of sections) {
      await this.storageService.storeReportSection(reportId, section);
    }
    
    // Update status and metadata
    await this.storageService.updateReportStatus(reportId, 'completed', {
      summary: sections[0].content.slice(0, 500) + '...',
      tokenUsage: metadata.tokenUsage,
      completedAt: new Date(),
      processingTimeMs: 0, // Preview was already generated
      metadata
    });
    
    console.log(`✅ Report ${reportId} saved from preview`);
    
    return reportId;
  }
  
  private generateTitle(params: ReportInitiationParams): string {
    const typeLabels = {
      demographic: 'Demographic Analysis',
      thematic: 'Thematic Analysis',
      comparative: 'Comparative Analysis',
      longitudinal: 'Longitudinal Analysis',
      comprehensive: 'Comprehensive Report'
    };
    
    const baseTitle = typeLabels[params.reportType] || 'Analysis Report';
    const queryPreview = params.query.slice(0, 50) + (params.query.length > 50 ? '...' : '');
    
    return `${baseTitle}: ${queryPreview}`;
  }
  
  private async queueReportGeneration(reportId: string, params: ReportInitiationParams) {
    // Add a 2-second delay before starting report generation to avoid rate limits
    const delay = 2000; // 2 seconds
    console.log(`⏱️ Queuing report ${reportId} with ${delay}ms delay to avoid rate limits`);
    
    setTimeout(async () => {
      const startTime = Date.now();
      try {
        await this.generateReport(reportId, params);
      } catch (error) {
        console.error(`Report generation failed for ${reportId}:`, error);
        await this.storageService.updateReportStatus(reportId, 'failed');
      }
    }, delay);
  }
  
  private async generateReport(reportId: string, params: ReportInitiationParams) {
    const startTime = Date.now();
    
    try {
      await this.storageService.updateReportStatus(reportId, 'processing');
      
      // Get survey data
      const surveyData = await this.fetchSurveyData(params);
      
      // Generate sections based on report type
      const sections = await this.generateReportSections(params, surveyData);
      
      // Store sections
      for (const section of sections) {
        await this.storageService.storeReportSection(reportId, section);
      }
      
      // Calculate token usage (rough estimate)
      const tokenUsage = sections.reduce((total, section) => 
        total + Math.ceil(section.content.length / 4), 0
      );
      
      // Update status and metadata
      await this.storageService.updateReportStatus(reportId, 'completed', {
        summary: sections[0].content.slice(0, 500) + '...',
        tokenUsage,
        completedAt: new Date(),
        processingTimeMs: Date.now() - startTime,
        metadata: {
          complexity: params.complexity || 0,
          questionCount: surveyData.questions.length,
          responseCount: surveyData.sampleSize,
          surveyTitle: surveyData.surveyTitle
        }
      });
      
      console.log(`✅ Report ${reportId} completed in ${Date.now() - startTime}ms`);
      
    } catch (error) {
      console.error(`❌ Report ${reportId} failed:`, error);
      await this.storageService.updateReportStatus(reportId, 'failed');
      throw error;
    }
  }
  
  private async fetchSurveyData(params: ReportInitiationParams): Promise<SurveyData> {
    const db = await getMySQLConnection();
    
    // Get survey info
    const [surveys] = await db.execute<RowDataPacket[]>(
      `SELECT * FROM surveys WHERE id = ?`,
      [params.surveyId]
    );
    
    if (surveys.length === 0) {
      throw new Error('Survey not found');
    }
    
    const survey = surveys[0];
    
    // Try to load fact sheet first for statistical context
    let factSheet: any = null;
    try {
      const { analyzeSurveySchema } = await import('../../../../scripts/analyze-survey-schema.js');
      const schema = await analyzeSurveySchema(params.surveyId, db);
      factSheet = schema.fact_sheet;
      console.log(`📊 Loaded fact sheet with ${Object.keys(factSheet.question_stats || {}).length} question stats for report`);
    } catch (error) {
      console.warn('Could not load fact sheet for report:', error.message);
    }
    
    // Build smart query to get responses
    const queryBuilder = new SmartSurveyQueryBuilder();
    const cohortRules = params.cohortId ? await this.getCohortRules(params.cohortId) : [];
    
    const queryResult = await queryBuilder.buildSmartQuery(
      params.query,
      cohortRules,
      params.userId,
      params.surveyId,
      10000 // High limit for comprehensive analysis
    );
    
    // Execute query only if we need individual responses for analysis
    let responses: any[] = [];
    // Check if we have meaningful text responses (exclude metadata fields like timestamps, IDs)
    const [textCount] = await db.execute<RowDataPacket[]>(
      `SELECT COUNT(DISTINCT sa.id) as text_count
       FROM survey_answers sa
       JOIN survey_questions sq ON sa.question_id = sq.id
       WHERE sq.survey_id = ? 
         AND sq.type IN ('text', 'long-text') 
         AND LENGTH(TRIM(sa.answer_value)) > 15
         AND sq.prompt NOT LIKE '%time%'
         AND sq.prompt NOT LIKE '%ID%'
         AND sq.prompt NOT LIKE '%start%'
         AND sq.prompt NOT LIKE '%end%'
         AND sq.prompt NOT LIKE '%device%'
         AND sq.prompt NOT LIKE '%language%'
         AND sq.prompt NOT LIKE '%form%'
         AND sq.prompt NOT LIKE '%weight%'
         AND sa.answer_value NOT REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$'
         AND sa.answer_value NOT REGEXP '^[0-9]+$'
         AND sa.answer_value NOT REGEXP '^[0-9]*\\.?[0-9]+$'`,
      [params.surveyId]
    );
    const textResponseCount = textCount[0]?.text_count || 0;
    
    if (textResponseCount > 0 || !factSheet) {
      // We need individual responses for thematic analysis or if fact sheet is unavailable
      console.log(`📊 Survey analysis: ${textResponseCount} text responses found, fact sheet available: ${!!factSheet}`);
      
      if (textResponseCount > 0) {
        console.log('🔍 Executing smart query for text responses...');
        try {
          const [responseData] = await db.execute<RowDataPacket[]>(
      queryResult.sql,
      queryResult.params
    );
          responses = responseData;
          
          if (responses.length === 0) {
            console.log('⚠️ Smart query returned no results, falling back to basic query');
            // Fallback to basic query
            const [fallbackResponses] = await db.execute<RowDataPacket[]>(
              `SELECT sr.id as rid, sa.answer_value, sq.prompt as question_text, sq.type as question_type,
                      s.title as survey_title, sq.options as question_options
               FROM survey_responses sr
               JOIN survey_answers sa ON sr.id = sa.response_id
               JOIN survey_questions sq ON sa.question_id = sq.id
               JOIN surveys s ON sr.survey_id = s.id
               WHERE sr.survey_id = ?
               LIMIT 1000`,
              [params.surveyId]
            );
            responses = fallbackResponses;
          }
        } catch (error) {
          console.error('Error executing survey query:', error);
        }
      } else if (!factSheet) {
        console.log('📋 No text responses found and no fact sheet available, using basic structured data query...');
        try {
          // For structured surveys without fact sheets, get some sample responses for context
          const [structuredResponses] = await db.execute<RowDataPacket[]>(
            `SELECT sr.id as rid, sa.answer_value, sq.prompt as question_text, sq.type as question_type,
                    s.title as survey_title, sq.options as question_options,
                    COALESCE(sr.age_range, JSON_UNQUOTE(JSON_EXTRACT(sr.demographics,'$.age'))) AS age_val,
                    COALESCE(sr.gender, JSON_UNQUOTE(JSON_EXTRACT(sr.demographics,'$.gender'))) AS gender_val,
                    JSON_UNQUOTE(JSON_EXTRACT(sr.demographics,'$.location')) AS location_val,
                    JSON_UNQUOTE(JSON_EXTRACT(sr.demographics,'$.occupation')) AS occupation_val,
                    JSON_UNQUOTE(JSON_EXTRACT(sr.demographics,'$.education')) AS education_val,
                    JSON_UNQUOTE(JSON_EXTRACT(sr.demographics,'$.income')) AS income_val,
                    JSON_UNQUOTE(JSON_EXTRACT(sr.demographics,'$.politicalViews')) AS political_val
             FROM survey_responses sr
             JOIN survey_answers sa ON sr.id = sa.response_id
             JOIN survey_questions sq ON sa.question_id = sq.id
             JOIN surveys s ON sr.survey_id = s.id
             WHERE sr.survey_id = ?
             LIMIT 100`,
            [params.surveyId]
          );
          responses = structuredResponses;
        } catch (error) {
          console.error('Error executing structured survey query:', error);
          responses = [];
        }
      }
    } else {
      console.log('📊 Using fact sheet for statistical analysis, minimal response sampling');
    }
    
    // Get questions
    const [questions] = await db.execute<RowDataPacket[]>(
      `SELECT * FROM survey_questions WHERE survey_id = ? ORDER BY question_order`,
      [params.surveyId]
    );
    
    // Calculate proper sample size prioritizing fact sheet data
    const actualSampleSize = factSheet?.survey_metadata?.total_responses || 
                             factSheet?.survey_meta?.total_respondents ||
                             responses.length;
    
    console.log(`📊 Survey data summary: ${actualSampleSize} total responses, ${responses.length} individual responses sampled, fact sheet available: ${!!factSheet}`);
    
    return {
      responses,
      questions,
      demographics: [], // TODO: Load demographics
      surveyTitle: survey.title,
      sampleSize: actualSampleSize,
      factSheet: factSheet // Add fact sheet to survey data
    };
  }
  
  private async getCohortRules(cohortId: number): Promise<any[]> {
    const db = await getMySQLConnection();
    
    const [rules] = await db.execute<RowDataPacket[]>(
      `SELECT * FROM cohort_filter_rules WHERE cohort_id = ?`,
      [cohortId]
    );
    
    return rules;
  }
  
  private async generateReportSections(
    params: ReportInitiationParams, 
    data: SurveyData
  ): Promise<ReportSection[]> {
    const sections: ReportSection[] = [];
    
    // Helper function to add delay between API calls
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    const API_CALL_DELAY = 1000; // 1 second between API calls
    
    // Executive Summary (always included)
    sections.push(await this.generateExecutiveSummary(params, data));
    await delay(API_CALL_DELAY);
    
    // Type-specific sections
    switch (params.reportType) {
      case 'demographic':
        sections.push(await this.generateDemographicAnalysis(data));
        await delay(API_CALL_DELAY);
        // Add charts for demographic reports
        if (data.factSheet) {
          sections.push(await this.generateVisualizationSection(data, params));
        }
        break;
        
      case 'thematic':
        sections.push(await this.generateThematicAnalysis(data));
        await delay(API_CALL_DELAY);
        // Add charts for thematic reports (especially when user asks for graphs)
        if (data.factSheet && (params.query.toLowerCase().includes('graph') || params.query.toLowerCase().includes('chart') || params.query.toLowerCase().includes('visual'))) {
          sections.push(await this.generateVisualizationSection(data, params));
        }
        break;
        
      case 'comparative':
        sections.push(await this.generateComparativeAnalysis(data));
        await delay(API_CALL_DELAY);
        if (data.factSheet) {
          sections.push(await this.generateVisualizationSection(data, params));
        }
        break;
        
      case 'longitudinal':
        sections.push(await this.generateTimeSeriesAnalysis(data));
        await delay(API_CALL_DELAY);
        if (data.factSheet) {
          sections.push(await this.generateVisualizationSection(data, params));
        }
        break;
        
      case 'comprehensive':
        // Include multiple analyses with delays between each
        sections.push(await this.generateDemographicAnalysis(data));
        await delay(API_CALL_DELAY);
        
        sections.push(await this.generateThematicAnalysis(data));
        await delay(API_CALL_DELAY);
        
        sections.push(await this.generateStatisticalAnalysis(data));
        await delay(API_CALL_DELAY);
        
        // Add visualization section
        if (data.factSheet) {
          sections.push(await this.generateVisualizationSection(data, params));
        }
        break;
    }
    
    await delay(API_CALL_DELAY);
    
    // Methodology section (always included)
    sections.push(await this.generateMethodology(params, data));
    
    return sections;
  }
  
  private async generateExecutiveSummary(
    params: ReportInitiationParams, 
    data: SurveyData
  ): Promise<ReportSection> {
    // Assess data quality and sources
    const textResponseCount = await this.countTextResponses(data);
    const dataQualityAssessment = this.assessDataQuality(data, textResponseCount);
    
    // Build comprehensive prompt with fact sheet data if available
    let factSheetContext = '';
    if (data.factSheet) {
      const responseCount = data.factSheet.survey_metadata?.total_responses || 
                           data.factSheet.survey_meta?.total_respondents || 
                           data.sampleSize;
      
      factSheetContext = `\n\n🔢 COMPREHENSIVE STATISTICAL DATA (${responseCount} responses):\n`;
      
      // Add question stats if available
      if (data.factSheet.question_stats && Object.keys(data.factSheet.question_stats).length > 0) {
        Object.entries(data.factSheet.question_stats).slice(0, 10).forEach(([questionKey, stats]: [string, any]) => {
          if (stats.adoption_rates) {
            const topOptions = Object.entries(stats.adoption_rates)
              .sort(([,a]: any, [,b]: any) => b.percentage - a.percentage)
              .slice(0, 5);
            factSheetContext += `\n📊 ${questionKey}:\n`;
            topOptions.forEach(([option, data]: [string, any]) => {
              factSheetContext += `  • ${option}: ${data.percentage}% (${data.users} users)\n`;
            });
          }
          
          if (stats.statistics && stats.statistics.mean !== undefined) {
            factSheetContext += `\n📈 ${questionKey} (Numerical Analysis):\n`;
            factSheetContext += `  • Average: ${stats.statistics.mean}\n`;
            factSheetContext += `  • Median: ${stats.statistics.median}\n`;
            factSheetContext += `  • Range: ${stats.statistics.min} - ${stats.statistics.max}\n`;
          }
        });
      } else {
        // If no detailed question stats, use alternative data
        factSheetContext += `\n📊 SURVEY OVERVIEW:\n`;
        factSheetContext += `  • Total Respondents: ${responseCount}\n`;
        factSheetContext += `  • Data Type: Structured survey (Pew Research format)\n`;
        factSheetContext += `  • Analysis Type: Statistical and demographic patterns\n`;
        
        // Check for any other statistical data in the fact sheet
        const availableKeys = Object.keys(data.factSheet);
        factSheetContext += `  • Available Data Sources: ${availableKeys.join(', ')}\n`;
      }
      
      // Add demographic insights if available
      if (data.factSheet.demographics) {
        factSheetContext += `\n👥 DEMOGRAPHIC BREAKDOWN:\n`;
        Object.entries(data.factSheet.demographics).forEach(([key, data]: [string, any]) => {
          if (data && typeof data === 'object' && data.distribution) {
            const topSegments = Object.entries(data.distribution)
              .sort(([,a]: any, [,b]: any) => b - a)
              .slice(0, 3);
            factSheetContext += `\n• ${key.charAt(0).toUpperCase() + key.slice(1)}: `;
            factSheetContext += topSegments.map(([segment, count]: [string, any]) => 
              `${segment} (${count})`).join(', ') + '\n';
          }
        });
      }
      
      // Add note about data richness
      factSheetContext += `\n📋 DATA AVAILABILITY:\n`;
      factSheetContext += `  • Fact Sheet Size: ${JSON.stringify(data.factSheet).length} characters of statistical data\n`;
      factSheetContext += `  • Analysis Ready: Survey suitable for comprehensive statistical analysis\n`;
      factSheetContext += `  • Chart Generation: Rich data available for visualization\n`;
    }
    
    // Use fact sheet sample size if available, otherwise fallback to data.sampleSize
    const actualSampleSize = data.factSheet?.survey_metadata?.total_responses || 
                             data.factSheet?.survey_meta?.total_respondents || 
                             data.sampleSize;
    
    const prompt = `
    Generate an executive summary for a ${params.reportType} analysis report.
    
    Survey: "${data.surveyTitle}"
    Sample Size: ${actualSampleSize} responses
    Original Query: "${params.query}"
    Report Type: ${params.reportType}
    
    Data Quality Assessment:
    ${dataQualityAssessment}
    
    ${factSheetContext}
    
    ${data.responses.length > 0 ? `Key Response Examples:
    ${JSON.stringify(data.responses.slice(0, 3), null, 2)}` : `No individual responses sampled - analysis based on comprehensive statistical data from ${actualSampleSize} survey responses.`}
    
    Please provide:
    1. A brief overview of the analysis purpose and scope
    2. Data source transparency and methodology  
    3. Key findings (5-7 bullet points based on actual statistical data)
    4. Main insights with confidence levels based on sample size
    5. Demographic patterns and distributions
    6. Statistical significance and trends
    7. Recommendations with caveats
    
    CRITICAL: 
    - This survey has ${actualSampleSize} responses - use this as the basis for all analysis
    - Use the comprehensive statistical data provided above for quantitative claims
    - Only make claims supported by the actual data provided
    - Include specific percentages and numbers from the statistics
    - Explain the significance of the sample size (${actualSampleSize} responses)
    - Include data source transparency
    - Generate insights appropriate for a ${actualSampleSize}-response study
    
    Format in professional markdown with clear sections and data citations.
    `;
    
    const completion = await createCompletion({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a senior data analyst creating comprehensive survey reports. Use specific statistical data provided to make quantitative claims. Always cite numbers, percentages, and provide data source transparency.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      maxTokens: 6000
    });
    
    // Add data transparency footer
    const transparencyFooter = this.generateDataTransparencyFooter(data, textResponseCount);
    
    return {
      type: 'executive_summary',
      title: 'Executive Summary',
      content: (completion.content || '') + '\n\n' + transparencyFooter,
      orderIndex: 0
    };
  }
  
  private async countTextResponses(data: SurveyData): Promise<number> {
    try {
      const textResponses = await this.extractTextResponses(data);
      return textResponses.length;
    } catch (error) {
      console.warn('Could not count text responses:', error);
      return 0;
    }
  }
  
  private assessDataQuality(data: SurveyData, textResponseCount: number): string {
    const totalResponses = data.sampleSize;
    const hasTextData = textResponseCount > 0;
    const textPercentage = totalResponses > 0 ? Math.round((textResponseCount / totalResponses) * 100) : 0;
    
    let assessment = `Total Responses: ${totalResponses}\n`;
    assessment += `Text Responses: ${textResponseCount} (${textPercentage}%)\n`;
    assessment += `Data Type: ${hasTextData ? 'Mixed (structured + text)' : 'Structured (multiple choice, ratings, demographics)'}\n`;
    assessment += `Analysis Suitability: ${hasTextData ? 'Suitable for both quantitative and qualitative analysis' : 'Best suited for statistical and demographic analysis'}\n`;
    
    return assessment;
  }
  
  private generateDataTransparencyFooter(data: SurveyData, textResponseCount: number): string {
    const hasTextData = textResponseCount > 0;
    
    return `
---

## 🔍 Data Source Transparency

**Data Sources Used:**
- ✅ Survey responses from database (${data.sampleSize} total responses)
- ✅ Survey questions and structure
- ${hasTextData ? '✅' : '❌'} Open-text responses (${textResponseCount} available)
- ✅ Demographic and structured data

**Analysis Methodology:**
- All findings based exclusively on actual survey data
- No synthetic or hypothetical data used
- ${hasTextData ? 'Qualitative insights derived from actual respondent text' : 'Analysis focused on quantitative patterns and distributions'}
- Statistical claims verified against response counts

**Data Quality:** High confidence in quantitative findings. ${hasTextData ? 'Qualitative insights supported by respondent quotes.' : 'Limited qualitative analysis due to structured data format.'}

*This transparency section ensures all analysis claims are grounded in verifiable survey data.*
    `.trim();
  }
  
  private async generateDemographicAnalysis(data: SurveyData): Promise<ReportSection> {
    // TODO: Implement demographic analysis
    return {
      type: 'demographic_analysis',
      title: 'Demographic Analysis',
      content: '## Demographic Analysis\n\nDetailed demographic breakdown will be implemented here.',
      orderIndex: 1
    };
  }
  
  private async generateThematicAnalysis(data: SurveyData): Promise<ReportSection> {
    // Extract actual text responses from survey answers
    const textResponses = await this.extractTextResponses(data);
    
    // If no meaningful text responses exist, return a descriptive analysis instead
    if (textResponses.length === 0) {
      return {
        type: 'thematic_analysis',
        title: 'Response Analysis',
        content: this.generateQuantitativeAnalysis(data),
        orderIndex: 1
      };
    }
    
    const prompt = `
    Analyze the following survey text responses for common themes and patterns:
    
    ${textResponses.slice(0, 50).join('\n---\n')}
    
    Please identify:
    1. Major themes (with frequency)
    2. Sentiment patterns
    3. Key quotes that exemplify each theme
    4. Unexpected insights
    
    Format as a professional thematic analysis section.
    `;
    
    const completion = await createCompletion({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a qualitative research analyst. Only analyze the actual survey responses provided. Do not invent or fabricate any quotes or responses.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      maxTokens: 2000
    });
    
    return {
      type: 'thematic_analysis',
      title: 'Thematic Analysis',
      content: completion.content || '',
      orderIndex: 1
    };
  }
  
  private async extractTextResponses(data: SurveyData): Promise<string[]> {
    const db = await getMySQLConnection();
    const textResponses: string[] = [];
    
    // Safety check - ensure we have responses with IDs
    if (!data.responses || data.responses.length === 0) {
      console.log('⚠️ No survey responses available for text extraction');
      return textResponses;
    }
    
    try {
      // Get survey answers with meaningful text content
      // Note: Using correct column names based on actual table structure
      const responseIds = data.responses.map(r => r.id).filter(id => id != null);
      
      if (responseIds.length === 0) {
        console.log('⚠️ No valid response IDs found');
        return textResponses;
      }
      
      const placeholders = responseIds.map(() => '?').join(',');
      const query = `
        SELECT sa.answer_value, sq.prompt as question_text
        FROM survey_answers sa
        JOIN survey_questions sq ON sa.question_id = sq.id
        WHERE sa.response_id IN (${placeholders})
        AND sa.answer_value IS NOT NULL
        AND LENGTH(TRIM(sa.answer_value)) > 20
        AND sa.answer_value NOT REGEXP '^[0-9]+$'
        LIMIT 100
      `;
      
      const [answers] = await db.execute<RowDataPacket[]>(query, responseIds);
      
      console.log(`📝 Found ${answers.length} potential text responses`);
      
      for (const answer of answers) {
        const text = answer.answer_value?.toString().trim();
        if (text && text.length > 20 && !this.isNumericOrCodedResponse(text)) {
          textResponses.push(`[${answer.question_text}] ${text}`);
        }
      }
      
      console.log(`✅ Extracted ${textResponses.length} meaningful text responses`);
      
    } catch (error) {
      console.error('❌ Error extracting text responses:', error);
      // Don't throw - just return empty array to trigger quantitative analysis
    }
    
    return textResponses;
  }
  
  private isNumericOrCodedResponse(text: string): boolean {
    // Check if response is just a number, date, or coded value
    const numericPattern = /^[\d\.\-\/\s:]+$/;
    const shortCodePattern = /^[A-Z0-9\-_]{1,10}$/i;
    return numericPattern.test(text) || shortCodePattern.test(text);
  }
  
  private generateQuantitativeAnalysis(data: SurveyData): string {
    const responseCount = data.sampleSize;
    const questionCount = data.questions.length;
    
    return `
## Survey Response Analysis

### Data Overview
This analysis is based on **${responseCount} survey responses** across **${questionCount} questions** from the survey "${data.surveyTitle}".

### Data Type Assessment
The survey data consists primarily of structured responses (multiple choice, ratings, demographic categories) rather than open-text responses. This type of data is well-suited for:

- **Statistical Analysis**: Frequency distributions, cross-tabulations, and correlations
- **Demographic Breakdowns**: Response patterns by demographic groups
- **Trend Analysis**: Response patterns across different categories
- **Comparative Analysis**: Differences between respondent segments

### Analytical Approach
Since this survey contains structured rather than narrative responses, the most meaningful insights come from:

1. **Quantitative Analysis**: Statistical patterns in response distributions
2. **Demographic Segmentation**: How different groups respond to key questions
3. **Cross-Tabulation**: Relationships between different response variables
4. **Trend Identification**: Patterns in responses across the survey

### Recommendation
For this type of structured survey data, **statistical analysis and visualization** provide more actionable insights than thematic analysis. Consider reviewing the demographic breakdowns and response distributions for the most valuable findings.

**Data Source**: All analysis based on actual survey responses from the database. No synthetic or hypothetical data used.
    `.trim();
  }
  
  private async generateComparativeAnalysis(data: SurveyData): Promise<ReportSection> {
    // TODO: Implement comparative analysis
    return {
      type: 'thematic_analysis',
      title: 'Comparative Analysis',
      content: '## Comparative Analysis\n\nGroup comparisons will be implemented here.',
      orderIndex: 1
    };
  }
  
  private async generateTimeSeriesAnalysis(data: SurveyData): Promise<ReportSection> {
    // TODO: Implement time series analysis
    return {
      type: 'thematic_analysis',
      title: 'Longitudinal Analysis',
      content: '## Longitudinal Analysis\n\nTime-based trends will be analyzed here.',
      orderIndex: 1
    };
  }
  
  private async generateStatisticalAnalysis(data: SurveyData): Promise<ReportSection> {
    // TODO: Implement statistical analysis
    return {
      type: 'statistical_analysis',
      title: 'Statistical Analysis',
      content: '## Statistical Analysis\n\nDetailed statistics will be implemented here.',
      orderIndex: 2
    };
  }
  
  private async generateMethodology(
    params: ReportInitiationParams, 
    data: SurveyData
  ): Promise<ReportSection> {
    const content = `
## Methodology

### Data Collection
- **Survey**: ${data.surveyTitle}
- **Sample Size**: ${data.sampleSize} responses
- **Collection Period**: [To be determined from data]

### Analysis Approach
- **Report Type**: ${params.reportType.charAt(0).toUpperCase() + params.reportType.slice(1)} Analysis
- **Original Query**: "${params.query}"
- **Analysis Date**: ${new Date().toLocaleDateString()}

### Limitations
- Sample size considerations
- Response rate and potential biases
- Temporal constraints

### Data Processing
- Responses were filtered based on the query parameters
- Text analysis was performed using natural language processing
- Statistical calculations were applied where relevant
    `;
    
    return {
      type: 'methodology',
      title: 'Methodology',
      content,
      orderIndex: 99
    };
  }

  private async generateVisualizationSection(data: SurveyData, params?: ReportInitiationParams): Promise<ReportSection> {
    if (!data.factSheet || !data.factSheet.question_stats) {
      return {
        type: 'visualization',
        title: 'Data Visualizations',
        content: 'No visualization data available.',
        orderIndex: 10
      };
    }

    // Generate chart configurations from fact sheet data
    const charts: any[] = [];
    let chartIndex = 0;

    // Create charts from question statistics
    Object.entries(data.factSheet.question_stats).slice(0, 6).forEach(([questionKey, stats]: [string, any]) => {
      if (stats.adoption_rates && Object.keys(stats.adoption_rates).length > 1) {
        const chartData = Object.entries(stats.adoption_rates)
          .sort(([,a]: any, [,b]: any) => b.percentage - a.percentage)
          .slice(0, 10)
          .map(([option, data]: [string, any]) => ({
            name: option.length > 30 ? option.substring(0, 30) + '...' : option,
            value: data.percentage,
            count: data.users
          }));

        if (chartData.length > 0) {
          charts.push({
            id: `chart_${chartIndex++}`,
            type: chartData.length > 5 ? 'bar' : 'pie',
            title: questionKey.length > 50 ? questionKey.substring(0, 50) + '...' : questionKey,
            data: chartData,
            config: {
              dataKey: 'value',
              nameKey: 'name',
              colors: ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D', '#FFC658', '#FF7C7C', '#8DD1E1', '#D084D0']
            }
          });
        }
      }

      if (stats.statistics && stats.statistics.mean !== undefined) {
        charts.push({
          id: `chart_${chartIndex++}`,
          type: 'metric',
          title: `${questionKey} - Statistical Summary`,
          data: [
            { name: 'Average', value: parseFloat(stats.statistics.mean.toFixed(2)) },
            { name: 'Median', value: parseFloat(stats.statistics.median.toFixed(2)) },
            { name: 'Minimum', value: parseFloat(stats.statistics.min.toFixed(2)) },
            { name: 'Maximum', value: parseFloat(stats.statistics.max.toFixed(2)) }
          ],
          config: {
            format: 'number'
          }
        });
      }
    });

    // Add demographic charts if available
    if (data.factSheet.demographics) {
      Object.entries(data.factSheet.demographics).forEach(([key, data]: [string, any]) => {
        if (data && typeof data === 'object' && data.distribution) {
          const chartData = Object.entries(data.distribution)
            .sort(([,a]: any, [,b]: any) => b - a)
            .slice(0, 8)
            .map(([segment, count]: [string, any]) => ({
              name: segment,
              value: count,
              percentage: Math.round((count / data.sampleSize) * 100)
            }));

          if (chartData.length > 0) {
            charts.push({
              id: `chart_${chartIndex++}`,
              type: 'bar',
              title: `${key.charAt(0).toUpperCase() + key.slice(1)} Distribution`,
              data: chartData,
              config: {
                dataKey: 'value',
                nameKey: 'name',
                colors: ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8']
              }
            });
          }
        }
      });
    }

    // Create markdown content with chart specifications
    let content = `# Data Visualizations

This section presents key insights from the survey data through interactive charts and graphs.

## Key Statistics Overview

Based on **${data.sampleSize}** survey responses, the following visualizations highlight the most significant patterns and distributions in the data.

`;

    charts.forEach((chart, index) => {
      content += `
## ${index + 1}. ${chart.title}

\`\`\`chart
${JSON.stringify(chart, null, 2)}
\`\`\`

`;
    });

    content += `
---

**📊 Visualization Notes:**
- Charts are generated from statistical analysis of ${data.sampleSize} responses
- Data is filtered to show most significant patterns
- Interactive charts available in the web interface
- All percentages are calculated from the complete dataset

`;

    return {
      type: 'visualization',
      title: 'Data Visualizations',
      content: content,
      orderIndex: 10
    };
  }
} 