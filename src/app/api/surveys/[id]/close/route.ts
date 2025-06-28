import { NextRequest, NextResponse } from "next/server";
import { SurveyRepo } from "@/app/utils/database/survey-repo";

// POST /api/surveys/[id]/close – close a survey early
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const userId = req.headers.get('x-user-id');
        if (!userId) {
            return NextResponse.json({ error: 'User not authenticated' }, { status: 401 });
        }

        const { id } = await params;
        const surveyId = parseInt(id);
        if (isNaN(surveyId)) {
            return NextResponse.json({ error: 'Invalid survey ID' }, { status: 400 });
        }

        const success = await SurveyRepo.closeSurvey(surveyId, parseInt(userId));
        if (!success) {
            return NextResponse.json({ error: 'Survey not found or permission denied' }, { status: 404 });
        }
        return NextResponse.json({ status: true, message: 'Survey closed' });
    } catch (err) {
        console.error('Error closing survey', err);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
} 