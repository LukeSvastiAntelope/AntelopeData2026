import { NextRequest, NextResponse } from "next/server";
import { SurveyRepo } from "@/app/utils/database/survey-repo";

// GET /api/public/surveys/[slug]/status - Get survey status and basic info
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ slug: string }> }
) {
    try {
        const { slug } = await params;
        
        // Get survey by slug (any status)
        const survey = await SurveyRepo.getSurveyBySlugAny(slug);
        
        if (!survey) {
            return NextResponse.json({ 
                status: false,
                error: 'Survey not found' 
            }, { status: 404 });
        }

        // Get response count
        const db = await (await import("@/app/utils/database/db")).openSql();
        const [countRows] = await db.execute(
            'SELECT COUNT(*) as response_count FROM survey_responses WHERE survey_id = ?',
            [(survey as any).id]
        );

        const responseCount = (countRows as any)[0].response_count;

        // Return survey status info
        return NextResponse.json({ 
            status: true,
            survey: {
                id: (survey as any).id,
                title: (survey as any).title,
                description: (survey as any).description,
                status: (survey as any).status,
                is_public: (survey as any).is_public,
                slug: (survey as any).slug,
                stopped_at: (survey as any).stopped_at,
                stop_reason: (survey as any).stop_reason,
                campaign_start_at: (survey as any).campaign_start_at,
                campaign_end_at: (survey as any).campaign_end_at,
                response_count: responseCount,
                created_at: (survey as any).created_at
            }
        });

    } catch (error) {
        console.error("Error in GET /api/public/surveys/[slug]/status:", error);
        return NextResponse.json({ 
            status: false, 
            error: 'Internal server error' 
        }, { status: 500 });
    }
} 