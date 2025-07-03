import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { ReportStorageService } from '@/app/utils/services/report-storage-service';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { id } = await params;
    const storageService = new ReportStorageService();
    
    // Get report metadata
    const report = await storageService.getReport(id, session.user.id);
    
    if (!report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }
    
    // Get report sections
    const sections = await storageService.getReportSections(id);
    
    return NextResponse.json({
      report: {
        id: report.id,
        title: report.title,
        type: report.report_type,
        status: report.status,
        query: report.query_text,
        surveyId: report.survey_id,
        cohortId: report.cohort_id,
        createdAt: report.created_at,
        completedAt: report.completed_at,
        tokenUsage: report.token_usage,
        processingTimeMs: report.processing_time_ms,
        summary: report.summary,
        metadata: report.metadata ? JSON.parse(report.metadata) : {}
      },
      sections: sections
    });
    
  } catch (error) {
    console.error('Error retrieving report:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve report' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { id } = await params;
    const storageService = new ReportStorageService();
    
    // First check if the report exists and belongs to the user
    const report = await storageService.getReport(id, session.user.id);
    
    if (!report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }
    
    // Delete the report (this should cascade to sections due to foreign key constraints)
    const success = await storageService.deleteReport(id, session.user.id);
    
    if (!success) {
      return NextResponse.json({ error: 'Failed to delete report' }, { status: 500 });
    }
    
    return NextResponse.json({ 
      status: true,
      message: 'Report deleted successfully' 
    });
    
  } catch (error) {
    console.error('Error deleting report:', error);
    return NextResponse.json(
      { error: 'Failed to delete report' },
      { status: 500 }
    );
  }
} 