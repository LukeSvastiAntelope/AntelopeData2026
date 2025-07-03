import { openSql as getMySQLConnection } from "@/app/utils/database/db";
import { v4 as uuidv4 } from 'uuid';
import { RowDataPacket } from 'mysql2';

export interface CreateReportParams {
  userId: string;
  surveyId?: number;
  cohortId?: number;
  query: string;
  reportType: 'demographic' | 'thematic' | 'comparative' | 'longitudinal' | 'comprehensive';
  title: string;
  complexity?: number;
}

export interface ReportSection {
  type: 'executive_summary' | 'demographic_analysis' | 'thematic_analysis' | 
        'statistical_analysis' | 'insights' | 'methodology' | 'appendix';
  title: string;
  content: string;
  chartSpecs?: any;
  orderIndex: number;
}

export interface Report extends RowDataPacket {
  id: string;
  user_id: string;
  survey_id?: number;
  cohort_id?: number;
  query_text: string;
  report_type: string;
  status: 'initiated' | 'processing' | 'completed' | 'failed';
  title: string;
  summary?: string;
  token_usage?: number;
  processing_time_ms?: number;
  created_at: Date;
  completed_at?: Date;
  metadata?: any;
}

export class ReportStorageService {
  // Store report metadata
  async createReport(params: CreateReportParams): Promise<string> {
    const reportId = uuidv4();
    const db = await getMySQLConnection();
    
    // Create metadata object with complexity
    const metadata = {
      complexity: params.complexity || 0
    };
    
    await db.execute(
      `INSERT INTO reports (id, user_id, survey_id, cohort_id, query_text, 
       report_type, status, title, metadata, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, 'initiated', ?, ?, NOW())`,
      [reportId, params.userId, params.surveyId || null, params.cohortId || null, 
       params.query, params.reportType, params.title, JSON.stringify(metadata)]
    );
    
    return reportId;
  }
  
  // Update report status
  async updateReportStatus(
    reportId: string, 
    status: 'processing' | 'completed' | 'failed',
    metadata?: {
      summary?: string;
      tokenUsage?: number;
      completedAt?: Date;
      processingTimeMs?: number;
      metadata?: any;
    }
  ): Promise<void> {
    const db = await getMySQLConnection();
    
    let query = `UPDATE reports SET status = ?`;
    const params: any[] = [status];
    
    if (metadata?.summary) {
      query += `, summary = ?`;
      params.push(metadata.summary);
    }
    
    if (metadata?.tokenUsage) {
      query += `, token_usage = ?`;
      params.push(metadata.tokenUsage);
    }
    
    if (metadata?.completedAt) {
      query += `, completed_at = ?`;
      params.push(metadata.completedAt);
    }
    
    if (metadata?.processingTimeMs) {
      query += `, processing_time_ms = ?`;
      params.push(metadata.processingTimeMs);
    }
    
    if (metadata?.metadata) {
      // Merge with existing metadata
      const [existing] = await db.execute<RowDataPacket[]>(
        `SELECT metadata FROM reports WHERE id = ?`,
        [reportId]
      );
      
      let finalMetadata = metadata.metadata;
      if (existing.length > 0 && existing[0].metadata) {
        const existingMetadata = JSON.parse(existing[0].metadata);
        finalMetadata = { ...existingMetadata, ...metadata.metadata };
      }
      
      query += `, metadata = ?`;
      params.push(JSON.stringify(finalMetadata));
    }
    
    query += ` WHERE id = ?`;
    params.push(reportId);
    
    await db.execute(query, params);
  }
  
  // Store report sections
  async storeReportSection(reportId: string, section: ReportSection): Promise<void> {
    const db = await getMySQLConnection();
    
    await db.execute(
      `INSERT INTO report_sections (report_id, section_type, title, content, 
       chart_specs, order_index) VALUES (?, ?, ?, ?, ?, ?)`,
      [reportId, section.type, section.title, section.content, 
       section.chartSpecs ? JSON.stringify(section.chartSpecs) : null, 
       section.orderIndex]
    );
  }
  
  // Get report by ID
  async getReport(reportId: string, userId: string): Promise<Report | null> {
    const db = await getMySQLConnection();
    
    const [reports] = await db.execute<Report[]>(
      `SELECT * FROM reports WHERE id = ? AND user_id = ?`,
      [reportId, userId]
    );
    
    return reports.length > 0 ? reports[0] : null;
  }
  
  // Get report sections
  async getReportSections(reportId: string): Promise<any[]> {
    const db = await getMySQLConnection();
    
    const [sections] = await db.execute<RowDataPacket[]>(
      `SELECT * FROM report_sections WHERE report_id = ? ORDER BY order_index`,
      [reportId]
    );
    
    return sections.map(section => ({
      ...section,
      chart_specs: section.chart_specs ? JSON.parse(section.chart_specs) : null
    }));
  }
  
  // Get user's reports
  async getUserReports(
    userId: string, 
    options?: {
      status?: string;
      surveyId?: number;
      limit?: number;
      offset?: number;
    }
  ): Promise<Report[]> {
    const db = await getMySQLConnection();
    
    let query = `SELECT * FROM reports WHERE user_id = ?`;
    const params: any[] = [userId];
    
    if (options?.status) {
      query += ` AND status = ?`;
      params.push(options.status);
    }
    
    if (options?.surveyId) {
      query += ` AND survey_id = ?`;
      params.push(options.surveyId);
    }
    
    query += ` ORDER BY created_at DESC`;
    
    if (options?.limit) {
      query += ` LIMIT ?`;
      params.push(options.limit);
      
      if (options?.offset) {
        query += ` OFFSET ?`;
        params.push(options.offset);
      }
    }
    
    const [reports] = await db.execute<Report[]>(query, params);
    return reports;
  }

  // Delete report and all its sections
  async deleteReport(reportId: string, userId: string): Promise<boolean> {
    const pool = await getMySQLConnection();
    const conn = await pool.getConnection();

    try {
      await conn.beginTransaction();

      // Delete all sections for the report first (due to FK constraint)
      await conn.query(
        `DELETE FROM report_sections WHERE report_id = ?`,
        [reportId]
      );

      // Delete the report itself (only if it belongs to the user)
      const [result] = await conn.query(
        `DELETE FROM reports WHERE id = ? AND user_id = ?`,
        [reportId, userId]
      );

      const affectedRows = (result as any).affectedRows;
      if (affectedRows === 0) {
        await conn.rollback();
        return false;
      }

      await conn.commit();
      return true;
    } catch (error) {
      await conn.rollback();
      console.error('Error deleting report:', error);
      return false;
    } finally {
      conn.release();
    }
  }
  
  // Helper methods for embeddings (to be implemented with Pinecone integration)
  async createReportEmbeddings(reportId: string, content: string): Promise<void> {
    // TODO: Implement with Pinecone integration
    // This will:
    // 1. Chunk the content
    // 2. Generate embeddings using OpenAI
    // 3. Store in Pinecone
    // 4. Store references in report_embeddings table
    console.log('Report embeddings creation not yet implemented');
  }
  
  // Chunk content for embeddings
  private chunkContent(content: string, chunkSize: number = 1000): string[] {
    const chunks: string[] = [];
    const sentences = content.split(/[.!?]+/);
    let currentChunk = '';
    
    for (const sentence of sentences) {
      if ((currentChunk + sentence).length > chunkSize && currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        currentChunk = sentence;
      } else {
        currentChunk += (currentChunk ? '. ' : '') + sentence;
      }
    }
    
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }
    
    return chunks;
  }
} 