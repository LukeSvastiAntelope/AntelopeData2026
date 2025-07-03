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
        
        if (survey) {
            return NextResponse.json({ status: true, survey });
        }

        // Not active – check if survey exists but is inactive
        const existsAny = await SurveyRepo.getSurveyBySlugAny(slug);
        if (existsAny) {
            // Allow preview of draft surveys
            if ((existsAny as any).status === 'draft') {
                return NextResponse.json({ 
                    status: true, 
                    survey: existsAny,
                    preview: true 
                });
            }
            
            return NextResponse.json(
                { error: 'Survey is not active' },
                { status: 410 }
            );
        }

        return NextResponse.json({ error: 'Survey not found' }, { status: 404 });

    } catch (error) {
        console.error("Error in GET /api/surveys/[slug]:", error);
        return NextResponse.json({ 
            status: false, 
            message: error instanceof Error ? error.message : 'Internal server error' 
        }, { status: 500 });
    }
} 