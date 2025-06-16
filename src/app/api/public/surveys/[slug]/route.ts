import { NextRequest, NextResponse } from "next/server";
import { SurveyRepo } from "@/app/utils/database/survey-repo";

// GET /api/surveys/[slug] - Get public survey by slug
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ slug: string }> }
) {
    try {
        const { slug } = await params;
        const survey = await SurveyRepo.getSurveyBySlug(slug);
        
        if (!survey) {
            return NextResponse.json({ 
                error: 'Survey not found or not published' 
            }, { status: 404 });
        }

        return NextResponse.json({ 
            status: true, 
            survey 
        });

    } catch (error) {
        console.error("Error in GET /api/surveys/[slug]:", error);
        return NextResponse.json({ 
            status: false, 
            message: error instanceof Error ? error.message : 'Internal server error' 
        }, { status: 500 });
    }
} 