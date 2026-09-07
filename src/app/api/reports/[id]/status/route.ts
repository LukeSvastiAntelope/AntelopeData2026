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
    const report = await storageService.getReport(id, session.user.id);
    
    if (!report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }
    
    // If completed, include summary and sections preview
    if (report.status === 'completed') {
      const sections = await storageService.getReportSections(id);
      
      return NextResponse.json({
        status: report.status,
        completedAt: report.completed_at,
        summary: report.summary,
        tokenUsage: report.token_usage,
        processingTimeMs: report.processing_time_ms,
        sections: sections.map(s => ({
          type: s.section_type,
          title: s.title,
          preview: s.content.slice(0, 200) + '...'
        }))
      });
    }
    
    // For non-completed reports, just return status
    return NextResponse.json({
      status: report.status,
      estimatedCompletion: report.status === 'processing' 
        ? new Date(Date.now() + 60000).toISOString() 
        : null
    });
    
  } catch (error) {
    console.error('Error checking report status:', error);
    return NextResponse.json(
      { error: 'Failed to check report status' },
      { status: 500 }
    );
  }
} 