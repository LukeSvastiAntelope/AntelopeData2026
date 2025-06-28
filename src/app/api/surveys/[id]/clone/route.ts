import { NextRequest, NextResponse } from "next/server";
import { SurveyRepo } from "@/app/utils/database/survey-repo";

export async function POST(
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

    // Clone the survey using the repository function
    const result = await SurveyRepo.cloneSurvey(surveyId, userId);
    
    if (!result) {
      return NextResponse.json({ 
        status: false, 
        message: 'Survey not found or access denied' 
      }, { status: 404 });
    }

    return NextResponse.json({ 
      status: true, 
      result,
      message: 'Survey cloned successfully'
    });

  } catch (error) {
    console.error('Error cloning survey:', error);
    return NextResponse.json({ 
      status: false, 
      message: 'Internal server error during survey cloning' 
    }, { status: 500 });
  }
} 