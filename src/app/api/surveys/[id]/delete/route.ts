import { NextRequest, NextResponse } from "next/server";
import { SurveyRepo } from "@/app/utils/database/survey-repo";

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
    if (hasResponses && !req.nextUrl.searchParams.get('force')) {
      return NextResponse.json({ 
        status: false, 
        message: 'Survey has responses. Add ?force=true to delete anyway.',
        hasResponses: true,
        responseCount: (survey as any).response_count
      }, { status: 400 });
    }

    const deleted = await SurveyRepo.deleteSurvey(surveyId, userId);
    
    if (deleted) {
      return NextResponse.json({ 
        status: true, 
        message: 'Survey deleted successfully' 
      });
    } else {
      return NextResponse.json({ 
        status: false, 
        message: 'Failed to delete survey' 
      }, { status: 500 });
    }

  } catch (error) {
    console.error('Error deleting survey:', error);
    return NextResponse.json({ 
      status: false, 
      message: 'Internal server error' 
    }, { status: 500 });
  }
} 