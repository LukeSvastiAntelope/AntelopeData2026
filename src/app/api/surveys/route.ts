import { NextRequest, NextResponse } from "next/server";
import { SurveyRepo } from "@/app/utils/database/survey-repo";
import { verifyConfirmationToken } from "@/app/utils/api/token";

// GET /api/surveys - surveys created by current user
export async function GET(req: NextRequest) {
  const userIdHeader = req.headers.get('x-user-id');
  if (!userIdHeader) {
    return NextResponse.json({ status:false, message:'Unauthorized' }, { status:401 });
  }
  const userId = Number(userIdHeader);
  console.log('Fetching surveys for user ID:', userId);
  try {
    const surveys = await SurveyRepo.getSurveysByCreator(userId);
    console.log('Found surveys for user:', surveys.length);
    console.log('Survey titles:', surveys.map((s: any) => s.title));
    // Return all surveys with full data that the frontend expects
    const surveysWithFullData = surveys.map((s:any) => ({
      id: s.id,
      title: s.title,
      description: s.description,
      slug: s.slug,
      status: s.status,
      is_public: s.is_public,
      created_at: s.created_at,
      response_count: s.response_count || 0,
      source: s.source || 'native',
      source_metadata: s.source_metadata || null,
      start_at: s.start_at,
      end_at: s.end_at
    }));
    return NextResponse.json({ status:true, surveys: surveysWithFullData });
  } catch (err) {
    console.error('Error fetching user surveys', err);
    return NextResponse.json({ status:false, message:'Internal error' }, { status:500 });
  }
}

// POST /api/surveys - Create new survey
export async function POST(req: NextRequest) {
    try {
        // Get user ID from the request (set by middleware)
        const userId = req.headers.get('x-user-id');
        
        if (!userId) {
            return NextResponse.json({ 
                error: 'User not authenticated' 
            }, { status: 401 });
        }

        const body = await req.json();
        
        // Basic validation
        if (!body.title || !body.questions || !Array.isArray(body.questions)) {
            return NextResponse.json({ 
                error: 'Missing required fields: title, questions' 
            }, { status: 400 });
        }

        if (body.questions.length === 0) {
            return NextResponse.json({ 
                error: 'At least one question is required' 
            }, { status: 400 });
        }

        // Create the survey
        const result = await SurveyRepo.createSurvey(body, parseInt(userId));
        
        // Get the created survey to return the actual slug
        const survey = await SurveyRepo.getSurveyById(result, parseInt(userId));
        
        return NextResponse.json({ 
            status: true, 
            id: result,
            slug: (survey as any)?.slug,
            message: 'Survey created successfully' 
        }, { status: 201 });

    } catch (error) {
        console.error("Error in POST /api/surveys:", error);
        return NextResponse.json({ 
            status: false, 
            message: error instanceof Error ? error.message : 'Internal server error' 
        }, { status: 500 });
    }
} 