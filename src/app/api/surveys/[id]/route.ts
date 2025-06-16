import { NextRequest, NextResponse } from "next/server";
import { SurveyRepo } from "@/app/utils/database/survey-repo";

// GET /api/surveys/[id] - Get specific survey by ID
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const userId = req.headers.get('x-user-id');
        
        if (!userId) {
            return NextResponse.json({ 
                error: 'User not authenticated' 
            }, { status: 401 });
        }

        const { id } = await params;
        const surveyId = parseInt(id);
        if (isNaN(surveyId)) {
            return NextResponse.json({ 
                error: 'Invalid survey ID' 
            }, { status: 400 });
        }

        const survey = await SurveyRepo.getSurveyById(surveyId, parseInt(userId));
        
        if (!survey) {
            return NextResponse.json({ 
                error: 'Survey not found' 
            }, { status: 404 });
        }

        return NextResponse.json({ 
            status: true, 
            survey 
        });

    } catch (error) {
        console.error("Error in GET /api/surveys/[id]:", error);
        return NextResponse.json({ 
            status: false, 
            message: error instanceof Error ? error.message : 'Internal server error' 
        }, { status: 500 });
    }
}

// PUT /api/surveys/[id] - Update specific survey
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const userId = req.headers.get('x-user-id');
        
        if (!userId) {
            return NextResponse.json({ 
                error: 'User not authenticated' 
            }, { status: 401 });
        }

        const { id } = await params;
        const surveyId = parseInt(id);
        if (isNaN(surveyId)) {
            return NextResponse.json({ 
                error: 'Invalid survey ID' 
            }, { status: 400 });
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

        // Update the survey
        const success = await SurveyRepo.updateSurvey(surveyId, body, parseInt(userId));
        
        if (!success) {
            return NextResponse.json({ 
                error: 'Survey not found or you do not have permission to edit it' 
            }, { status: 404 });
        }

        return NextResponse.json({ 
            status: true, 
            message: 'Survey updated successfully' 
        });

    } catch (error) {
        console.error("Error in PUT /api/surveys/[id]:", error);
        return NextResponse.json({ 
            status: false, 
            message: error instanceof Error ? error.message : 'Internal server error' 
        }, { status: 500 });
    }
} 