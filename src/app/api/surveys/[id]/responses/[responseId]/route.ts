import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from '@/app/utils/auth/require-user';
import { SurveyRepo } from "@/app/utils/database/survey-repo";

// GET /api/surveys/[id]/responses/[responseId] - Get specific survey response
export async function GET(
    req: NextRequest, 
    { params }: { params: Promise<{ id: string; responseId: string }> }
) {
    try {
        const auth = requireUserId(req);
    if (typeof auth !== 'string') return auth;
    const userId = Number(auth);

        const { id, responseId } = await params;
        const surveyId = parseInt(id);
        const responseIdInt = parseInt(responseId);
        
        if (isNaN(surveyId) || isNaN(responseIdInt)) {
            return NextResponse.json({ 
                error: 'Invalid survey ID or response ID' 
            }, { status: 400 });
        }

        // First verify the user owns this survey
        const survey = await SurveyRepo.getSurveyById(surveyId, parseInt(userId));
        if (!survey) {
            return NextResponse.json({ 
                error: 'Survey not found or access denied' 
            }, { status: 404 });
        }

        // Get the specific response
        const response = await SurveyRepo.getSurveyResponse(surveyId, responseIdInt);
        
        if (!response) {
            return NextResponse.json({ 
                error: 'Response not found' 
            }, { status: 404 });
        }

        return NextResponse.json({ 
            status: true, 
            response 
        });

    } catch (error) {
        console.error("Error in GET /api/surveys/[id]/responses/[responseId]:", error);
        return NextResponse.json({ 
            status: false, 
            message: error instanceof Error ? error.message : 'Internal server error' 
        }, { status: 500 });
    }
} 