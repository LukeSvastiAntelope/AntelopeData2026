import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from '@/app/utils/auth/require-user';
import { SurveyRepo } from "@/app/utils/database/survey-repo";

// POST /api/surveys/[id]/close – close a survey early
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const auth = requireUserId(req);
    if (typeof auth !== 'string') return auth;
    const userId = Number(auth);

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