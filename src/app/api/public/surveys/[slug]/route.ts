import { NextRequest, NextResponse } from "next/server";
import { SurveyRepo } from "@/app/utils/database/survey-repo";

// GET /api/surveys/[slug] - Get public survey by slug
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ slug: string }> }
) {
    try {
        const { slug } = await params;
        
        // Auto-activate any scheduled surveys that should be active now
        await SurveyRepo.autoActivateScheduled();
        
        // Strip the password hash before sending to the public; expose only a boolean.
        const sanitize = (s: any) => {
            if (!s) return s;
            const { access_password, ...rest } = s;
            return { ...rest, requires_password: Boolean(access_password) };
        };

        const survey = await SurveyRepo.getSurveyBySlug(slug);

        if (survey) {
            return NextResponse.json({ status: true, survey: sanitize(survey) });
        }

        // Not active – check if survey exists but is inactive
        const existsAny = await SurveyRepo.getSurveyBySlugAny(slug);
        if (existsAny) {
            // Allow preview of draft and scheduled surveys
            if ((existsAny as any).status === 'draft' || (existsAny as any).status === 'scheduled') {
                return NextResponse.json({
                    status: true,
                    survey: sanitize(existsAny),
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