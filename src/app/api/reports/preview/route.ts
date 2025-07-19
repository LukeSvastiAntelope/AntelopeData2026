import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { ReportGenerationService } from '@/app/utils/services/report-generation-service';

export const maxDuration = 300; // 5 minutes for comprehensive reports

export async function POST(req: NextRequest) {
  try {
    console.log('🔍 Report preview generation started');
    
    // Authenticate request
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    const body = await req.json();
    const { surveyId, cohortId, query, reportType, complexity = 0.5 } = body;
    
    if (!query || !reportType) {
      return NextResponse.json({ 
        error: "Missing required fields: query and reportType" 
      }, { status: 400 });
    }
    
    const reportService = new ReportGenerationService();
    
    const preview = await reportService.generateReportPreview({
      userId: session.user.id,
      surveyId,
      cohortId,
      query,
      reportType,
      tokenBudget: 6000,
      complexity
    });
    
    console.log(`✅ Report preview generated successfully`);
    
    return NextResponse.json({
      success: true,
      preview
    });
    
  } catch (error) {
    console.error('❌ Report preview generation failed:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
} 