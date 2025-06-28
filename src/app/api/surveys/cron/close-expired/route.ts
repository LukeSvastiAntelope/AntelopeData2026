import { NextRequest, NextResponse } from "next/server";
import { SurveyRepo } from "@/app/utils/database/survey-repo";

// POST /api/surveys/cron/close-expired - Close expired surveys (called by cron)
export async function POST(req: NextRequest) {
    try {
        const closedCount = await SurveyRepo.autoCloseExpired();
        
        return NextResponse.json({ 
            status: true, 
            closedCount,
            message: `${closedCount} survey(s) closed`
        });

    } catch (error) {
        console.error("Error in cron close-expired:", error);
        return NextResponse.json({ 
            status: false, 
            message: error instanceof Error ? error.message : 'Internal server error' 
        }, { status: 500 });
    }
} 