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
    
    // Execute query
    const [responses] = await db.execute<RowDataPacket[]>(
      queryResult.sql,
      queryResult.params
    );
    
    // Get questions
    const [questions] = await db.execute<RowDataPacket[]>(
      `SELECT * FROM survey_questions WHERE survey_id = ? ORDER BY question_order`,
      [params.surveyId]
    );
    
    return {
      responses,
      questions,
      demographics: [], // TODO: Load demographics
      surveyTitle: survey.title,
      sampleSize: responses.length
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
        break;
        
      case 'thematic':
        sections.push(await this.generateThematicAnalysis(data));
        break;
        
      case 'comparative':
        sections.push(await this.generateComparativeAnalysis(data));
        break;
        
      case 'longitudinal':
        sections.push(await this.generateTimeSeriesAnalysis(data));
        break;
        
      case 'comprehensive':
        // Include multiple analyses with delays between each
        sections.push(await this.generateDemographicAnalysis(data));
        await delay(API_CALL_DELAY);
        
        sections.push(await this.generateThematicAnalysis(data));
        await delay(API_CALL_DELAY);
        
        sections.push(await this.generateStatisticalAnalysis(data));
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
    const prompt = `
    Generate an executive summary for a ${params.reportType} analysis report.
    
    Survey: "${data.surveyTitle}"
    Sample Size: ${data.sampleSize} responses
    Original Query: "${params.query}"
    
    Key Data Points:
    ${JSON.stringify(data.responses.slice(0, 5), null, 2)}
    
    Please provide:
    1. A brief overview of the analysis purpose
    2. Key findings (3-5 bullet points)
    3. Main insights
    4. Recommendations
    
    Format in markdown with clear sections.
    `;
    
    const completion = await createCompletion({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a data analyst creating professional survey reports.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      maxTokens: 1500
    });
    
    return {
      type: 'executive_summary',
      title: 'Executive Summary',
      content: completion.content || '',
      orderIndex: 0
    };
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
    const textResponses = data.responses
      .filter(r => r.response_text && r.response_text.length > 20)
      .map(r => r.response_text);
    
    const prompt = `
    Analyze the following text responses for common themes and patterns:
    
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
        { role: 'system', content: 'You are a qualitative research analyst.' },
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
} 