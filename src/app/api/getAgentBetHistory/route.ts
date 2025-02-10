// src/app/api/getAgentBetHistory/route.ts
import { NextRequest } from "next/server";
import { UserRepo } from "@/app/utils/database/user-repo";
import { verifyConfirmationToken } from "@/app/utils/api/token";

export async function GET(req: NextRequest) {
    const token = req.headers.get('Authorization')?.split(' ')[1];
    const searchParams = req.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const offset = (page - 1) * limit;

    try {
        const jwtPayload = await verifyConfirmationToken(token as string);
        if (!jwtPayload) {
            return Response.json({ error: 'Invalid token' }, { status: 401 });
        }        

        const agent = await UserRepo.getAgentByUserId(jwtPayload.email as string);
        if (!agent) {
            return Response.json({ status: false, message: 'Agent not found' });
        }
        
        // Get paginated bets
        const bets = await UserRepo.getBetHistoryByAgentId(agent.id, limit, offset);
        const bets_stats = await UserRepo.getBetsStatsByAgentId(agent.id);

        return Response.json({
            status: true, 
            agent: agent, 
            bets: bets,
            bets_stats: bets_stats
        });
    } catch (error) {
        console.error("Error in getAgentBetHistory: ", error);
        return Response.json({ 
            status: false, 
            message: error instanceof Error ? error.message : 'Internal server error' 
        });
    }
}