import { NextRequest, NextResponse } from "next/server";
import { SurveyRepo } from "@/app/utils/database/survey-repo";

// Increase timeout for large survey deletions
export const maxDuration = 300; // 5 minutes

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userIdHeader = req.headers.get('x-user-id');
    if (!userIdHeader) {
      return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
    }
    const userId = parseInt(userIdHeader);
    const { id } = await params;
    const surveyId = parseInt(id);

    if (isNaN(surveyId)) {
      return NextResponse.json({ 
        status: false, 
        message: 'Invalid survey ID' 
      }, { status: 400 });
    }

    // Check if survey has responses
    const survey = await SurveyRepo.getSurveyById(surveyId, userId);
    if (!survey) {
      return NextResponse.json({ 
        status: false, 
        message: 'Survey not found or you do not have permission to delete it' 
      }, { status: 404 });
    }

    // Optional: Check if survey has responses and warn
    const hasResponses = (survey as any).response_count > 0;
    const responseCount = (survey as any).response_count || 0;
    
    if (hasResponses && !req.nextUrl.searchParams.get('force')) {
      return NextResponse.json({ 
        status: false, 
        message: responseCount > 1000 
          ? `Survey has ${responseCount} responses. This is a large survey and deletion may take several minutes. Add ?force=true to proceed.`
          : 'Survey has responses. Add ?force=true to delete anyway.',
        hasResponses: true,
        responseCount: responseCount,
        isLargeSurvey: responseCount > 1000
      }, { status: 400 });
    }

    console.log(`Starting deletion of survey ${surveyId} with ${responseCount} responses`);
    const startTime = Date.now();

    const deleted = await SurveyRepo.deleteSurvey(surveyId, userId);
    
    const duration = Math.round((Date.now() - startTime) / 1000);
    
    if (deleted) {
      console.log(`Survey ${surveyId} deleted successfully in ${duration} seconds`);
      return NextResponse.json({ 
        status: true, 
        message: responseCount > 1000 
          ? `Large survey deleted successfully in ${duration} seconds`
          : 'Survey deleted successfully',
        duration: duration,
        deletedResponses: responseCount
      });
    } else {
      return NextResponse.json({ 
        status: false, 
        message: 'Failed to delete survey' 
      }, { status: 500 });
    }

  } catch (error) {
    console.error('Error deleting survey:', error);
    
    // Provide more specific error messages for common issues
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    
    if (errorMessage.includes('Lock wait timeout')) {
      return NextResponse.json({ 
        status: false, 
        message: 'Deletion timed out due to database locks. Please try again in a few minutes, or contact support if the issue persists.',
        error: 'timeout'
      }, { status: 503 });
    }
    
    return NextResponse.json({ 
      status: false, 
      message: `Deletion failed: ${errorMessage}`,
      error: 'deletion_failed'
    }, { status: 500 });
  }
} 