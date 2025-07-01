import { NextRequest, NextResponse } from "next/server";
import { SurveyRepo } from "@/app/utils/database/survey-repo";

// POST /api/surveys/[id]/campaign - Manage survey campaign status
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const surveyId = parseInt(id);
        
        if (isNaN(surveyId)) {
            return NextResponse.json({ 
                error: 'Invalid survey ID' 
            }, { status: 400 });
        }

        // Get user ID from headers (set by middleware)
        const userId = req.headers.get('x-user-id');
        if (!userId) {
            return NextResponse.json({ 
                error: 'Unauthorized' 
            }, { status: 401 });
        }

        const body = await req.json();
        const { action, reason, campaignStartAt, campaignEndAt } = body;

        // Validate action
        if (!['start', 'stop', 'schedule'].includes(action)) {
            return NextResponse.json({ 
                error: 'Invalid action. Must be start, stop, or schedule' 
            }, { status: 400 });
        }

        // Verify user owns the survey
        const survey = await SurveyRepo.getSurveyById(surveyId, parseInt(userId));
        if (!survey) {
            return NextResponse.json({ 
                error: 'Survey not found or access denied' 
            }, { status: 404 });
        }

        let result;
        switch (action) {
            case 'start':
                result = await SurveyRepo.startCampaign(surveyId, parseInt(userId));
                break;
            case 'stop':
                result = await SurveyRepo.stopCampaign(surveyId, parseInt(userId), reason);
                break;
            case 'schedule':
                if (!campaignStartAt) {
                    return NextResponse.json({ 
                        error: 'campaignStartAt is required for scheduling' 
                    }, { status: 400 });
                }
                result = await SurveyRepo.scheduleCampaign(surveyId, parseInt(userId), campaignStartAt, campaignEndAt);
                break;
        }

        if (!result) {
            return NextResponse.json({ 
                error: 'Failed to update campaign status' 
            }, { status: 500 });
        }

        return NextResponse.json({ 
            status: true,
            message: `Campaign ${action}ed successfully`,
            surveyId,
            action
        });

    } catch (error) {
        console.error("Error in POST /api/surveys/[id]/campaign:", error);
        return NextResponse.json({ 
            status: false, 
            message: error instanceof Error ? error.message : 'Internal server error' 
        }, { status: 500 });
    }
}

// GET /api/surveys/[id]/campaign - Get campaign status and details
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const surveyId = parseInt(id);
        
        if (isNaN(surveyId)) {
            return NextResponse.json({ 
                error: 'Invalid survey ID' 
            }, { status: 400 });
        }

        // Get user ID from headers (set by middleware)
        const userId = req.headers.get('x-user-id');
        if (!userId) {
            return NextResponse.json({ 
                error: 'Unauthorized' 
            }, { status: 401 });
        }

        // Get survey with campaign details
        const campaign = await SurveyRepo.getCampaignStatus(surveyId, parseInt(userId));
        if (!campaign) {
            return NextResponse.json({ 
                error: 'Survey not found or access denied' 
            }, { status: 404 });
        }

        return NextResponse.json({ 
            status: true,
            campaign
        });

    } catch (error) {
        console.error("Error in GET /api/surveys/[id]/campaign:", error);
        return NextResponse.json({ 
            status: false, 
            message: error instanceof Error ? error.message : 'Internal server error' 
        }, { status: 500 });
    }
} 