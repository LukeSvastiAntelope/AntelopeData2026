# Report Generation Implementation Plan - Phase 2

## Current State Summary

### ✅ What We've Built
1. **Enhanced Query Classifier** (`enhanced-query-classifier.ts`)
   - Detects report-worthy queries
   - Classifies report types (demographic, thematic, comparative, longitudinal)
   - Estimates complexity and token budgets
   - Provides immediate response suggestions

2. **Understanding-First Pipeline**
   - Query classification happens FIRST
   - Fact sheets provide statistical foundation
   - LLM analysis uses enhanced context
   - Streaming disabled by default (citations work in non-streaming mode)

### ❌ What's Missing
1. **Two-Phase System**: Everything happens in one request
2. **Report Storage**: No persistence of generated reports
3. **Background Processing**: No async report generation
4. **Report UI**: No way to view/manage reports
5. **Cross-Session Access**: Reports not reusable

## Implementation Roadmap

### Phase 1: Database & Storage Infrastructure (2 days)

#### 1.1 Database Schema
```sql
-- Reports table for metadata
CREATE TABLE reports (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  survey_id INT,
  cohort_id INT,
  query_text TEXT NOT NULL,
  report_type ENUM('demographic', 'thematic', 'comparative', 'longitudinal', 'comprehensive'),
  status ENUM('initiated', 'processing', 'completed', 'failed') DEFAULT 'initiated',
  title VARCHAR(255),
  summary TEXT,
  token_usage INT,
  processing_time_ms INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL,
  metadata JSON,
  INDEX idx_user_reports (user_id, created_at),
  INDEX idx_status (status),
  INDEX idx_survey (survey_id),
  FOREIGN KEY (survey_id) REFERENCES surveys(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Report sections for modular storage
CREATE TABLE report_sections (
  id INT PRIMARY KEY AUTO_INCREMENT,
  report_id VARCHAR(36) NOT NULL,
  section_type ENUM('executive_summary', 'demographic_analysis', 'thematic_analysis', 
                    'statistical_analysis', 'insights', 'methodology', 'appendix'),
  title VARCHAR(255),
  content LONGTEXT,
  chart_specs JSON,
  order_index INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE,
  INDEX idx_report_sections (report_id, order_index)
);

-- Report embeddings for semantic search
CREATE TABLE report_embeddings (
  id INT PRIMARY KEY AUTO_INCREMENT,
  report_id VARCHAR(36) NOT NULL,
  section_id INT,
  embedding_id VARCHAR(255), -- Pinecone ID
  chunk_text TEXT,
  chunk_index INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE,
  FOREIGN KEY (section_id) REFERENCES report_sections(id) ON DELETE CASCADE,
  INDEX idx_report_embeddings (report_id)
);
```

#### 1.2 Storage Service
```typescript
// src/app/utils/services/report-storage-service.ts
export class ReportStorageService {
  // Store report metadata
  async createReport(params: CreateReportParams): Promise<string> {
    const reportId = crypto.randomUUID();
    const db = await getMySQLConnection();
    
    await db.execute(
      `INSERT INTO reports (id, user_id, survey_id, cohort_id, query_text, 
       report_type, status, title, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, 'initiated', ?, NOW())`,
      [reportId, params.userId, params.surveyId, params.cohortId, 
       params.query, params.reportType, params.title]
    );
    
    return reportId;
  }
  
  // Store report sections
  async storeReportSection(reportId: string, section: ReportSection): Promise<void> {
    const db = await getMySQLConnection();
    
    await db.execute(
      `INSERT INTO report_sections (report_id, section_type, title, content, 
       chart_specs, order_index) VALUES (?, ?, ?, ?, ?, ?)`,
      [reportId, section.type, section.title, section.content, 
       JSON.stringify(section.chartSpecs), section.orderIndex]
    );
  }
  
  // Create embeddings for semantic search
  async createReportEmbeddings(reportId: string, content: string): Promise<void> {
    const chunks = this.chunkContent(content, 1000);
    const embeddings = await this.generateEmbeddings(chunks);
    
    // Store in Pinecone
    const pineconeService = new PineconeService();
    const vectors = embeddings.map((embedding, index) => ({
      id: `report-${reportId}-chunk-${index}`,
      values: embedding,
      metadata: {
        reportId,
        chunkIndex: index,
        text: chunks[index],
        type: 'report'
      }
    }));
    
    await pineconeService.upsert(vectors);
    
    // Store references in MySQL
    const db = await getMySQLConnection();
    for (let i = 0; i < chunks.length; i++) {
      await db.execute(
        `INSERT INTO report_embeddings (report_id, embedding_id, chunk_text, chunk_index) 
         VALUES (?, ?, ?, ?)`,
        [reportId, vectors[i].id, chunks[i], i]
      );
    }
  }
}
```

### Phase 2: Two-Phase Report Generation (3 days)

#### 2.1 Report Generation Service
```typescript
// src/app/utils/services/report-generation-service.ts
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
      title: this.generateTitle(params)
    });
    
    // Queue for background processing
    await this.queueReportGeneration(reportId, params);
    
    return reportId;
  }
  
  private async queueReportGeneration(reportId: string, params: ReportInitiationParams) {
    // For now, use setTimeout. Later can upgrade to proper queue (BullMQ, etc)
    setTimeout(async () => {
      try {
        await this.generateReport(reportId, params);
      } catch (error) {
        console.error(`Report generation failed for ${reportId}:`, error);
        await this.updateReportStatus(reportId, 'failed');
      }
    }, 0);
  }
  
  private async generateReport(reportId: string, params: ReportInitiationParams) {
    await this.updateReportStatus(reportId, 'processing');
    
    // Get survey data
    const surveyData = await this.fetchSurveyData(params);
    
    // Generate sections based on report type
    const sections = await this.generateReportSections(params, surveyData);
    
    // Store sections
    for (const section of sections) {
      await this.storageService.storeReportSection(reportId, section);
    }
    
    // Generate embeddings for search
    const fullContent = sections.map(s => s.content).join('\n\n');
    await this.storageService.createReportEmbeddings(reportId, fullContent);
    
    // Update status and metadata
    await this.updateReportStatus(reportId, 'completed', {
      summary: sections[0].content.slice(0, 500),
      tokenUsage: this.calculateTokenUsage(sections),
      completedAt: new Date()
    });
  }
  
  private async generateReportSections(
    params: ReportInitiationParams, 
    data: SurveyData
  ): Promise<ReportSection[]> {
    const sections: ReportSection[] = [];
    
    // Executive Summary (always included)
    sections.push(await this.generateExecutiveSummary(params, data));
    
    // Type-specific sections
    switch (params.reportType) {
      case 'demographic':
        sections.push(await this.generateDemographicAnalysis(data));
        sections.push(await this.generateCrossTabulations(data));
        break;
        
      case 'thematic':
        sections.push(await this.generateThematicAnalysis(data));
        sections.push(await this.generateSentimentAnalysis(data));
        break;
        
      case 'comparative':
        sections.push(await this.generateComparativeAnalysis(data));
        sections.push(await this.generateTrendAnalysis(data));
        break;
        
      case 'longitudinal':
        sections.push(await this.generateTimeSeriesAnalysis(data));
        sections.push(await this.generateChangeAnalysis(data));
        break;
        
      case 'comprehensive':
        // Include all analyses
        sections.push(await this.generateDemographicAnalysis(data));
        sections.push(await this.generateThematicAnalysis(data));
        sections.push(await this.generateStatisticalAnalysis(data));
        sections.push(await this.generateInsights(data));
        break;
    }
    
    // Methodology section (always included)
    sections.push(await this.generateMethodology(params, data));
    
    return sections;
  }
}
```

#### 2.2 Modified Cohort Query Route
```typescript
// Update src/app/api/cohort/query/route.ts
export async function POST(req: NextRequest) {
  // ... existing code ...
  
  // Check if report-worthy
  if (reportAnalysis.isReportWorthy) {
    // Initiate report generation
    const reportService = new ReportGenerationService();
    const reportId = await reportService.initiateReport({
      userId,
      surveyId,
      cohortId: cohort?.id,
      query: question,
      reportType: reportAnalysis.reportType,
      tokenBudget: reportAnalysis.tokenBudget
    });
    
    // Return immediate acknowledgment
    return new NextResponse(JSON.stringify({
      status: true,
      content: `🔄 **Generating Comprehensive ${reportAnalysis.reportType.charAt(0).toUpperCase() + reportAnalysis.reportType.slice(1)} Report**\n\n` +
               `I'm creating a detailed analysis for your query. This will take 2-3 minutes to complete.\n\n` +
               `**What I'm analyzing:**\n` +
               `• ${reportAnalysis.reportType === 'demographic' ? 'Breaking down responses by demographic segments' : ''}` +
               `• ${reportAnalysis.reportType === 'thematic' ? 'Identifying key themes and patterns' : ''}` +
               `• ${reportAnalysis.reportType === 'comparative' ? 'Comparing different groups and segments' : ''}` +
               `• ${reportAnalysis.reportType === 'longitudinal' ? 'Analyzing changes over time' : ''}` +
               `• ${reportAnalysis.reportType === 'comprehensive' ? 'Conducting full multi-dimensional analysis' : ''}\n\n` +
               `I'll notify you when the report is ready. You can also check the status anytime by asking "What's the status of report ${reportId.slice(-6)}?"`,
      reportId: reportId,
      reportStatus: 'initiated',
      estimatedCompletion: new Date(Date.now() + 180000).toISOString()
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // ... continue with existing immediate response logic ...
}
```

### Phase 3: Report Status & Retrieval (2 days)

#### 3.1 Status Check API
```typescript
// src/app/api/reports/[id]/status/route.ts
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const db = await getMySQLConnection();
  const [reports] = await db.execute<any[]>(
    `SELECT * FROM reports WHERE id = ? AND user_id = ?`,
    [params.id, session.user.id]
  );
  
  if (reports.length === 0) {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  }
  
  const report = reports[0];
  
  // If completed, include summary
  if (report.status === 'completed') {
    const [sections] = await db.execute<any[]>(
      `SELECT * FROM report_sections WHERE report_id = ? ORDER BY order_index`,
      [params.id]
    );
    
    return NextResponse.json({
      status: report.status,
      completedAt: report.completed_at,
      summary: report.summary,
      sections: sections.map(s => ({
        type: s.section_type,
        title: s.title,
        preview: s.content.slice(0, 200) + '...'
      }))
    });
  }
  
  return NextResponse.json({
    status: report.status,
    estimatedCompletion: new Date(Date.now() + 60000).toISOString()
  });
}
```

#### 3.2 Report Retrieval API
```typescript
// src/app/api/reports/[id]/route.ts
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const db = await getMySQLConnection();
  
  // Get report metadata
  const [reports] = await db.execute<any[]>(
    `SELECT * FROM reports WHERE id = ? AND user_id = ?`,
    [params.id, session.user.id]
  );
  
  if (reports.length === 0) {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  }
  
  // Get report sections
  const [sections] = await db.execute<any[]>(
    `SELECT * FROM report_sections WHERE report_id = ? ORDER BY order_index`,
    [params.id]
  );
  
  return NextResponse.json({
    report: reports[0],
    sections: sections
  });
}
```

### Phase 4: UI Integration (2 days)

#### 4.1 Report Status Polling in Chat
```typescript
// Add to src/app/(secure)/cohort-chat/page.tsx
const checkReportStatus = async (reportId: string) => {
  try {
    const response = await fetch(`/api/reports/${reportId}/status`);
    const data = await response.json();
    
    if (data.status === 'completed') {
      // Add completion message to chat
      setMessages(prev => [...prev, {
        role: 'agent',
        content: `✅ **Report Complete!**\n\n${data.summary}\n\n[View Full Report →](/reports/${reportId})`,
        reportId: reportId,
        reportStatus: 'completed'
      }]);
    }
    
    return data;
  } catch (error) {
    console.error('Failed to check report status:', error);
    return null;
  }
};

// Poll for active reports
useEffect(() => {
  const activeReports = messages.filter(
    m => m.reportId && m.reportStatus === 'initiated'
  );
  
  if (activeReports.length > 0) {
    const interval = setInterval(() => {
      activeReports.forEach(msg => {
        if (msg.reportId) {
          checkReportStatus(msg.reportId);
        }
      });
    }, 10000); // Check every 10 seconds
    
    return () => clearInterval(interval);
  }
}, [messages]);
```

#### 4.2 Report Viewer Page
```typescript
// src/app/(secure)/reports/[id]/page.tsx
export default function ReportViewerPage({ params }: { params: { id: string } }) {
  const [report, setReport] = useState<Report | null>(null);
  const [sections, setSections] = useState<ReportSection[]>([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    fetchReport();
  }, [params.id]);
  
  const fetchReport = async () => {
    try {
      const response = await fetch(`/api/reports/${params.id}`);
      const data = await response.json();
      setReport(data.report);
      setSections(data.sections);
    } catch (error) {
      console.error('Failed to fetch report:', error);
    } finally {
      setLoading(false);
    }
  };
  
  if (loading) return <LoadingSpinner />;
  if (!report) return <div>Report not found</div>;
  
  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">{report.title}</h1>
        <div className="flex gap-4 text-sm text-gray-600 mt-2">
          <span>Generated: {new Date(report.created_at).toLocaleString()}</span>
          <span>Type: {report.report_type}</span>
          <span>Tokens: {report.token_usage?.toLocaleString()}</span>
        </div>
      </div>
      
      {/* Table of Contents */}
      <div className="mb-8 p-4 bg-gray-50 rounded-lg">
        <h2 className="font-semibold mb-2">Contents</h2>
        <ul className="space-y-1">
          {sections.map((section, index) => (
            <li key={section.id}>
              <a href={`#section-${index}`} className="text-blue-600 hover:underline">
                {section.title}
              </a>
            </li>
          ))}
        </ul>
      </div>
      
      {/* Report Sections */}
      {sections.map((section, index) => (
        <div key={section.id} id={`section-${index}`} className="mb-12">
          <h2 className="text-2xl font-semibold mb-4">{section.title}</h2>
          <div className="prose max-w-none">
            <ReactMarkdown>{section.content}</ReactMarkdown>
          </div>
          {section.chart_specs && (
            <div className="mt-4">
              {/* Render charts using existing chart components */}
              {renderChartFromSpec(section.chart_specs)}
            </div>
          )}
        </div>
      ))}
      
      {/* Export Options */}
      <div className="mt-12 flex gap-4">
        <Button onClick={() => exportToPDF(report, sections)}>
          Export as PDF
        </Button>
        <Button onClick={() => shareReport(report.id)}>
          Share Report
        </Button>
      </div>
    </div>
  );
}
```

### Phase 5: Advanced Features (3 days)

#### 5.1 Report Management Dashboard
```typescript
// src/app/(secure)/reports/page.tsx
export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [filter, setFilter] = useState<ReportFilter>({
    type: 'all',
    status: 'all',
    dateRange: 'all'
  });
  
  // List of user's reports with filtering, sorting, search
  // ...
}
```

#### 5.2 Cross-Report References
```typescript
// Enhanced query classifier to detect report references
if (query.match(/report\s+#?\w{6}/i)) {
  const reportId = extractReportId(query);
  const reportContent = await fetchReportContent(reportId);
  // Include report content in context for LLM
}
```

#### 5.3 Scheduled Reports
```typescript
// Database table for scheduled reports
CREATE TABLE scheduled_reports (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id VARCHAR(255) NOT NULL,
  survey_id INT,
  query_template TEXT,
  report_type VARCHAR(50),
  schedule_cron VARCHAR(100),
  last_run TIMESTAMP,
  next_run TIMESTAMP,
  active BOOLEAN DEFAULT true
);
```

## Implementation Priority

### Week 1: Foundation
1. ✅ Database schema creation
2. ✅ Basic report storage service
3. ✅ Report initiation in cohort query route
4. ⬜ Simple background processing

### Week 2: Core Features
1. ⬜ Report generation service
2. ⬜ Section generators (executive summary, demographic, etc.)
3. ⬜ Status checking API
4. ⬜ Basic report viewer

### Week 3: UI Polish
1. ⬜ Report status in chat UI
2. ⬜ Report viewer with charts
3. ⬜ Export functionality
4. ⬜ Report management dashboard

### Week 4: Advanced Features
1. ⬜ Semantic search across reports
2. ⬜ Cross-report references
3. ⬜ Scheduled reports
4. ⬜ Report sharing

## Technical Considerations

### Performance
- Use database indexes for fast lookups
- Implement caching for frequently accessed reports
- Consider CDN for report assets
- Optimize Pinecone queries for semantic search

### Scalability
- Design for horizontal scaling of report generation
- Use queue system for reliable background processing
- Implement rate limiting for report generation
- Consider S3/cloud storage for large reports

### Security
- Enforce user ownership checks on all report access
- Implement sharing permissions system
- Audit trail for report access
- Data retention policies

## Success Metrics

1. **Report Generation Time**: < 3 minutes for comprehensive reports
2. **Report Quality**: User satisfaction > 90%
3. **System Reliability**: > 99% successful report generation
4. **Feature Adoption**: > 50% of power users generating reports
5. **Cross-Session Usage**: > 30% of reports referenced in future sessions

## Next Steps

1. **Immediate**: Create database migration scripts
2. **This Week**: Implement basic report storage and generation
3. **Next Week**: Build UI components for report viewing
4. **Following Week**: Add advanced features and polish

This plan builds on our existing infrastructure while adding the sophisticated report generation system we originally envisioned. The phased approach allows for incremental development and testing. 