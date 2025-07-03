# Report Generation Integration Plan

## Overview
This document outlines how to integrate a sophisticated report generation pipeline with the existing cohort chat system, building upon the current fact sheet, data cards, and citation systems.

## Current Architecture Strengths

### ✅ Already Implemented
- **Fact Sheet System**: Pre-computed statistical summaries for instant responses
- **Data Cards**: Perplexity-style visualizations with multiple chart types
- **Citation System**: Sophisticated tooltip-based citations with confidence scoring
- **Smart Query Builder**: Intent classification and query optimization
- **Streaming Responses**: Real-time response delivery with progress indicators
- **Multi-layered Fallback**: Fact sheets → Smart queries → Raw data analysis

### 🎯 Integration Points
- **Token Management**: Existing system already handles token efficiency
- **Data Storage**: MySQL + Pinecone vector database infrastructure
- **User Authentication**: NextAuth integration for secure access
- **UI Components**: Rich markdown rendering with chart integration

## Report Generation Pipeline Architecture

### Phase 1: Query Classification & Immediate Response
```typescript
interface QueryClassification {
  type: 'quick_answer' | 'report_worthy' | 'complex_analysis';
  confidence: number;
  estimatedTokens: number;
  reportType?: 'demographic' | 'thematic' | 'comparative' | 'longitudinal';
}
```

**Integration with Existing System:**
- Extend `QueryIntentClassifier` to detect report-worthy queries
- Use existing fact sheet system for immediate acknowledgment
- Trigger background report generation for complex queries

### Phase 2: Background Report Generation
```typescript
interface ReportGenerationJob {
  id: string;
  userId: string;
  cohortId?: number;
  surveyId?: number;
  query: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  reportType: string;
  estimatedCompletion: Date;
  tokenBudget: number;
}
```

**Database Schema Extension:**
```sql
-- Reports table
CREATE TABLE reports (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  cohort_id INT,
  survey_id INT,
  query_text TEXT NOT NULL,
  report_type VARCHAR(50),
  status ENUM('queued', 'processing', 'completed', 'failed'),
  content LONGTEXT,
  metadata JSON,
  token_usage INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL,
  INDEX idx_user_reports (user_id, created_at),
  INDEX idx_status (status),
  FOREIGN KEY (survey_id) REFERENCES surveys(id)
);

-- Report sections for granular storage
CREATE TABLE report_sections (
  id INT PRIMARY KEY AUTO_INCREMENT,
  report_id VARCHAR(36) NOT NULL,
  section_type VARCHAR(50),
  title VARCHAR(255),
  content TEXT,
  order_index INT,
  metadata JSON,
  FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
);
```

### Phase 3: Real-time Progress Updates
```typescript
// Extend existing streaming system
interface StreamingResponse {
  type: 'immediate_response' | 'progress_update' | 'report_reference';
  content: string;
  reportId?: string;
  progress?: number;
  estimatedCompletion?: Date;
}
```

**WebSocket Integration:**
- Reuse existing streaming infrastructure
- Add progress notifications for background reports
- Real-time status updates in chat interface

### Phase 4: Report Storage & Retrieval
```typescript
interface ReportStorage {
  // Database storage for metadata and sections
  database: {
    metadata: ReportMetadata;
    sections: ReportSection[];
  };
  
  // Pinecone storage for semantic search
  vectorStore: {
    reportEmbeddings: VectorEmbedding[];
    sectionEmbeddings: VectorEmbedding[];
  };
  
  // File system for full report content
  fileSystem: {
    reportPath: string;
    formats: ['markdown', 'html', 'pdf'];
  };
}
```

## Implementation Phases

### Phase 1: Query Enhancement (1-2 days)
**Extend Existing Components:**

1. **Enhance QueryIntentClassifier:**
```typescript
// Add to existing src/app/utils/survey/query-intent-classifier.ts
export class EnhancedQueryIntentClassifier extends QueryIntentClassifier {
  classifyReportWorthiness(query: string): {
    isReportWorthy: boolean;
    reportType: string;
    estimatedComplexity: number;
    tokenBudget: number;
  } {
    // Detect complex analysis patterns
    const complexPatterns = [
      'comprehensive analysis',
      'detailed breakdown',
      'in-depth look',
      'full report',
      'complete analysis',
      'thorough examination'
    ];
    
    const isReportWorthy = complexPatterns.some(pattern => 
      query.toLowerCase().includes(pattern)
    ) || this.estimateTokenRequirement(query) > 2000;
    
    return {
      isReportWorthy,
      reportType: this.determineReportType(query),
      estimatedComplexity: this.calculateComplexity(query),
      tokenBudget: this.estimateTokenRequirement(query)
    };
  }
}
```

2. **Modify Cohort Query Route:**
```typescript
// Add to existing src/app/api/cohort/query/route.ts
export async function POST(req: NextRequest) {
  // ... existing code ...
  
  // NEW: Check if query is report-worthy
  const enhancedClassifier = new EnhancedQueryIntentClassifier();
  const reportAnalysis = enhancedClassifier.classifyReportWorthiness(question);
  
  if (reportAnalysis.isReportWorthy) {
    // Immediate response with report initiation
    const reportId = await ReportService.initiateReport({
      userId,
      cohortId: cohort?.id,
      surveyId,
      query: question,
      reportType: reportAnalysis.reportType,
      tokenBudget: reportAnalysis.tokenBudget
    });
    
    // Stream immediate acknowledgment
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(
          `🔄 **Generating Comprehensive Report**\n\n` +
          `I'm creating a detailed ${reportAnalysis.reportType} analysis for your query. ` +
          `This will take 2-3 minutes to complete.\n\n` +
          `**Report ID:** ${reportId}\n` +
          `**Estimated Completion:** ${new Date(Date.now() + 180000).toLocaleTimeString()}\n\n` +
          `I'll notify you when the report is ready and provide a summary here.`
        ));
        
        controller.enqueue(encoder.encode(
          `\n\n---\n📊 **REPORT STATUS:** Initiated\n` +
          `🎯 **TYPE:** ${reportAnalysis.reportType}\n` +
          `⏱️ **ESTIMATED TIME:** 2-3 minutes\n` +
          `🔗 **REFERENCE:** Report #${reportId.slice(-6)}`
        ));
        
        controller.close();
      }
    });
    
    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Report-Id": reportId,
        "X-Report-Status": "initiated"
      }
    });
  }
  
  // ... continue with existing logic for immediate responses ...
}
```

### Phase 2: Report Generation Service (2-3 days)
**New Service Implementation:**

```typescript
// New file: src/app/utils/services/report-generation-service.ts
export class ReportGenerationService {
  private static instance: ReportGenerationService;
  private reportQueue: Map<string, ReportGenerationJob> = new Map();
  
  static getInstance(): ReportGenerationService {
    if (!ReportGenerationService.instance) {
      ReportGenerationService.instance = new ReportGenerationService();
    }
    return ReportGenerationService.instance;
  }
  
  async initiateReport(params: ReportInitiationParams): Promise<string> {
    const reportId = crypto.randomUUID();
    
    // Store in database
    await this.createReportRecord(reportId, params);
    
    // Add to processing queue
    this.reportQueue.set(reportId, {
      id: reportId,
      ...params,
      status: 'queued',
      estimatedCompletion: new Date(Date.now() + 180000) // 3 minutes
    });
    
    // Process asynchronously
    this.processReportAsync(reportId);
    
    return reportId;
  }
  
  private async processReportAsync(reportId: string): Promise<void> {
    const job = this.reportQueue.get(reportId);
    if (!job) return;
    
    try {
      job.status = 'processing';
      await this.updateReportStatus(reportId, 'processing');
      
      // Generate comprehensive report
      const report = await this.generateComprehensiveReport(job);
      
      // Store report content
      await this.storeReportContent(reportId, report);
      
      // Create vector embeddings for search
      await this.createReportEmbeddings(reportId, report);
      
      job.status = 'completed';
      await this.updateReportStatus(reportId, 'completed');
      
      // Notify user (WebSocket or polling)
      await this.notifyReportCompletion(reportId);
      
    } catch (error) {
      job.status = 'failed';
      await this.updateReportStatus(reportId, 'failed');
      console.error(`Report generation failed for ${reportId}:`, error);
    }
  }
  
  private async generateComprehensiveReport(job: ReportGenerationJob): Promise<GeneratedReport> {
    // Use existing SmartSurveyQueryBuilder to get data
    const queryBuilder = new SmartSurveyQueryBuilder();
    const queryResult = await queryBuilder.buildSmartQuery(
      job.query,
      job.cohortId ? await this.getCohortRules(job.cohortId) : [],
      job.userId,
      job.surveyId,
      10000 // High limit for comprehensive analysis
    );
    
    // Execute query
    const db = await getMySQLConnection();
    const [rows] = await db.execute<any[]>(queryResult.sql, queryResult.params);
    
    // Generate report sections
    const sections = await this.generateReportSections(job, rows);
    
    return {
      id: job.id,
      title: this.generateReportTitle(job),
      sections,
      metadata: {
        generatedAt: new Date(),
        sampleSize: rows.length,
        tokenUsage: this.calculateTokenUsage(sections),
        reportType: job.reportType
      }
    };
  }
  
  private async generateReportSections(job: ReportGenerationJob, data: any[]): Promise<ReportSection[]> {
    const sections: ReportSection[] = [];
    
    // Executive Summary
    sections.push(await this.generateExecutiveSummary(job, data));
    
    // Demographic Analysis
    if (job.reportType === 'demographic' || job.reportType === 'comprehensive') {
      sections.push(await this.generateDemographicAnalysis(data));
    }
    
    // Thematic Analysis
    if (job.reportType === 'thematic' || job.reportType === 'comprehensive') {
      sections.push(await this.generateThematicAnalysis(data));
    }
    
    // Statistical Analysis
    sections.push(await this.generateStatisticalAnalysis(data));
    
    // Key Insights & Recommendations
    sections.push(await this.generateInsightsAndRecommendations(job, data));
    
    return sections;
  }
}
```

### Phase 3: UI Integration (1-2 days)
**Enhance Existing Chat Interface:**

```typescript
// Add to existing src/app/(secure)/cohort-chat/page.tsx
interface ChatMessage {
  role: 'user' | 'agent';
  content: string;
  citations?: Record<string, string>;
  chartSpec?: any;
  dataCards?: any[];
  isUpload?: boolean;
  reportId?: string; // NEW
  reportStatus?: 'initiated' | 'processing' | 'completed'; // NEW
}

// Add report status polling
useEffect(() => {
  const activeReports = messages.filter(m => m.reportId && m.reportStatus !== 'completed');
  
  if (activeReports.length > 0) {
    const interval = setInterval(async () => {
      for (const message of activeReports) {
        const status = await checkReportStatus(message.reportId!);
        if (status.status === 'completed') {
          // Add completed report to chat
          setMessages(prev => [
            ...prev,
            {
              role: 'agent',
              content: `📋 **Report #${message.reportId!.slice(-6)} Complete**\n\n${status.summary}`,
              reportId: message.reportId,
              reportStatus: 'completed'
            }
          ]);
        }
      }
    }, 10000); // Check every 10 seconds
    
    return () => clearInterval(interval);
  }
}, [messages]);
```

### Phase 4: Advanced Features (3-4 days)
**Report Management & Cross-Reference:**

```typescript
// New API routes for report management
// src/app/api/reports/route.ts
export async function GET(req: NextRequest) {
  // List user's reports
}

// src/app/api/reports/[id]/route.ts
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  // Get specific report
}

// Cross-conversation report referencing
// "What did Report #XYZ say about demographics?"
// "Compare this with the analysis from last week's report"
```

## Competitive Advantages

### 🚀 **Immediate Benefits**
1. **Unlimited Analysis Depth**: No token constraints on comprehensive reports
2. **Persistent Knowledge**: Reports become institutional memory
3. **Cross-Session Continuity**: Reference previous analysis naturally
4. **Professional Output**: Publication-ready analysis reports

### 🎯 **Integration Benefits**
1. **Seamless UX**: Builds on existing chat interface
2. **Leverages Existing Infrastructure**: Uses current database, auth, and UI systems
3. **Incremental Implementation**: Can be rolled out in phases
4. **Backward Compatible**: Doesn't break existing functionality

### 📊 **Data Quality Benefits**
1. **Comprehensive Analysis**: Full dataset analysis without token limits
2. **Multi-dimensional Insights**: Demographic, thematic, and statistical analysis
3. **Visual Reports**: Rich charts and data visualizations
4. **Exportable Results**: PDF, HTML, and dashboard integration

## Implementation Timeline

**Week 1: Foundation**
- Extend query classification system
- Implement basic report initiation
- Database schema updates

**Week 2: Core Generation**
- Report generation service
- Background processing
- Progress notifications

**Week 3: UI Integration**
- Chat interface enhancements
- Report status management
- Cross-reference system

**Week 4: Advanced Features**
- Report management dashboard
- Export capabilities
- Vector search integration

## Success Metrics

1. **User Engagement**: Increased session duration and query complexity
2. **Analysis Quality**: Deeper insights and more comprehensive responses
3. **System Efficiency**: Reduced token usage for complex queries
4. **User Satisfaction**: Higher quality analysis and professional output

This integration would transform your cohort chat from a Q&A system into a comprehensive analytical platform while maintaining the responsive, conversational experience users expect. 