import { NextRequest } from "next/server";
import { UserRepo } from "@/app/utils/database/user-repo";
import { verifyConfirmationToken } from "@/app/utils/api/token";
import { IBet } from "@/app/utils/interface";

export async function GET(req: NextRequest) {
    const token = req.headers.get('Authorization')?.split(' ')[1];
    try {
        const jwtPayload = await verifyConfirmationToken(token as string);
        if (!jwtPayload) {
            return Response.json({ error: 'Invalid token' }, { status: 401 });
        }        
        let agent = await UserRepo.getAgentByUserId(jwtPayload.email as string);
        if (!agent) {
            agent = await UserRepo.createAgent(jwtPayload.email as string);
        }
        agent.interests = agent.interests ? agent.interests : [];
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
        const bets = await UserRepo.getBetsByAgentId(agent.id);
        
        let successRate = 0;
        let totalBets = 0;
        let totalWins = 0;
        let closeBets = 0;

        for (const bet of bets as unknown as IBet[]) {
            totalBets++;
            if (bet.outcome === bet.choice) {
                totalWins++;
            }
            if (bet.status != 'open') {
                closeBets++;
            }
        }

        successRate = totalWins * 100 / closeBets;
        return Response.json({status: true, agent: agent, totalBets: totalBets, successRate: successRate});
    } catch (error) {
        console.error("Error in getAgentProfile: ", error);
        return Response.json({ 
            status: false, 
            message: error instanceof Error ? error.message : 'Internal server error' 
        });
    }
}