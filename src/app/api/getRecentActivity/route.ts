// src/app/api/getAgentBetHistory/route.ts
import { NextRequest } from "next/server";
import { UserRepo } from "@/app/utils/database/user-repo";

export async function GET(req: NextRequest) {
    const searchParams = req.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const offset = (page - 1) * limit;

    try {
        // Get paginated bets
        const activity = await UserRepo.getRecentActivity(limit, offset);

        return Response.json({
            status: true, 
            activity: activity
        });
    } catch (error) {
        console.error("Error in getAgentBetHistory: ", error);
        return Response.json({ 
            status: false, 
            message: error instanceof Error ? error.message : 'Internal server error' 
        });
    }
}