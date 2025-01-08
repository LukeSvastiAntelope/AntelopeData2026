export const dynamic = 'force-dynamic';
import { UserRepo } from "@/app/utils/database/user-repo";
import { Prediction } from "@/app/utils/interface";
import { automaticBettingOnList } from "@/app/utils/api/automaticBetting";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
    const agent_id = req.nextUrl.searchParams.get('agentId');
    try {
        const agent = await UserRepo.getAgentById(Number(agent_id));
        if (!agent) {
            return Response.json({ status: false, message: 'Agent not found' });
        }
        const predictions = await UserRepo.getOpenPredictions(Number(agent_id));

        if (typeof agent.interests === 'string') {
            agent.interests = agent.interests.split(',');
        }
        try {
            if (typeof agent.principles === 'string') {
                agent.principles = JSON.parse(agent.principles);
            }
            if (!Array.isArray(agent.principles)) {
                agent.principles = [];
            }
        } catch (e) {
            console.log("Error in principles: ", e);
            agent.principles = [];
        }
        
        const agentBets = await automaticBettingOnList(agent, predictions as Prediction[]);
        return Response.json({ status: true, bets: agentBets });
    } catch (error) {
        console.error("Error in createAgentBet: ", error);
        return Response.json({
            status: false,
            message: error instanceof Error ? error.message : 'Internal server error'
        });
    }
}