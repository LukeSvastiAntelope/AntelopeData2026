import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from '@/app/utils/auth/require-user';
import { SurveyRepo } from "@/app/utils/database/survey-repo";

// POST /api/surveys/[id]/publish - Publish a survey
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const auth = requireUserId(req);
    if (typeof auth !== 'string') return auth;
    const userId = Number(auth);

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

        // Update the survey and publish it
        const success = await SurveyRepo.publishSurvey(surveyId, body, parseInt(userId));
        
        if (!success) {
            return NextResponse.json({ 
                error: 'Survey not found or you do not have permission to publish it' 
            }, { status: 404 });
        }

        return NextResponse.json({ 
            status: true, 
            message: 'Survey published successfully' 
        });

    } catch (error) {
        console.error("Error in POST /api/surveys/[id]/publish:", error);
        return NextResponse.json({ 
            status: false, 
            message: error instanceof Error ? error.message : 'Internal server error' 
        }, { status: 500 });
    }
} 