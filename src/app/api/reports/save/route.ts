import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { ReportGenerationService } from '@/app/utils/services/report-generation-service';

export async function POST(req: NextRequest) {
  try {
    console.log('💾 Report save from preview started');
    
    // Authenticate request
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    const body = await req.json();
    const { surveyId, cohortId, query, reportType, complexity, sections, metadata } = body;
    
    if (!query || !reportType || !sections || !metadata) {
      return NextResponse.json({ 
        error: "Missing required fields: query, reportType, sections, metadata" 
      }, { status: 400 });
    }
    
    const reportService = new ReportGenerationService();
    
    const reportId = await reportService.saveReportFromPreview(
      {
        userId: session.user.id,
        surveyId,
        cohortId,
        query,
        reportType,
        tokenBudget: 6000,
        complexity
      },
      sections,
      metadata
    );
    
    console.log(`✅ Report saved successfully with ID: ${reportId}`);
    
    return NextResponse.json({
      success: true,
      reportId
    });
    
  } catch (error) {
    console.error('❌ Report save failed:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
} 