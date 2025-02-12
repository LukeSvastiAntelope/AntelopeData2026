import { NextRequest } from "next/server";
import { UserRepo } from "@/app/utils/database/user-repo";
import { verifyConfirmationToken } from "@/app/utils/api/token";

export async function GET(req: NextRequest) {
    const token = req.headers.get('Authorization')?.split(' ')[1];
    try {
        const jwtPayload = await verifyConfirmationToken(token as string);
        if (!jwtPayload) {
            return Response.json({ error: 'Invalid token' }, { status: 401 });
        }
        const user = await UserRepo.getUserById(jwtPayload.email as string);
        let agent = await UserRepo.getAgentByUserId(jwtPayload.email as string);
        if (!agent) {
            agent = await UserRepo.createAgent(jwtPayload.email as string);
        }
        agent.interests = agent.interests ? agent.interests : [];
        if (typeof agent.interests === 'string') {
            agent.interests = agent.interests.split(',');
        }
        agent.plugins = agent.plugins ? agent.plugins : [];
        if (typeof agent.plugins === 'string') {
            agent.plugins = agent.plugins.split(',');
        }
        const bets_stats = await UserRepo.getBetsStatsByAgentId(agent.id);
        const successRate = bets_stats.win_count / (Number(bets_stats.win_count) + Number(bets_stats.lose_count)) * 100;
        return Response.json({status: true, agent: agent, successRate: successRate, user: user});
    } catch (error) {
        console.error("Error in getAgentProfile: ", error);
        return Response.json({ 
            status: false, 
            message: error instanceof Error ? error.message : 'Internal server error' 
        });
    }
}