import { NextRequest, NextResponse } from "next/server";
import { SurveyRepo } from "@/app/utils/database/survey-repo";

// POST /api/surveys/cron/close-expired - Manage campaign lifecycle (called by cron)
export async function POST(req: NextRequest) {
    try {
        // Run both old and new campaign management systems
        const [
            oldClosedCount,
            activatedCount,
            stoppedCount
        ] = await Promise.all([
            SurveyRepo.autoCloseExpired(),        // Legacy system (end_at based)
            SurveyRepo.autoActivateScheduled(),   // New: Activate scheduled campaigns
            SurveyRepo.autoStopExpired()          // New: Stop campaigns past campaign_end_at
        ]);

        const totalChanges = oldClosedCount + activatedCount + stoppedCount;
        
        const results = {
            legacy_closed: oldClosedCount,
            campaigns_activated: activatedCount,
            campaigns_stopped: stoppedCount,
            total_changes: totalChanges
        };

        console.log(`📊 Campaign cron results:`, results);
        
        return NextResponse.json({ 
            status: true, 
            closedCount: totalChanges, // For backward compatibility
            results,
            message: `Campaign management: ${activatedCount} activated, ${stoppedCount} stopped, ${oldClosedCount} legacy closed`
        });

    } catch (error) {
        console.error("Error in cron close-expired:", error);
        return NextResponse.json({ 
            status: false, 
            message: error instanceof Error ? error.message : 'Internal server error' 
        }, { status: 500 });
    }
} 