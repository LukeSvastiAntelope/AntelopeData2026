import { NextRequest } from "next/server";
import { UserRepo } from "@/app/utils/database/user-repo";
import { auth } from "@/auth";

export async function GET(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return Response.json({ error: 'Not authenticated' }, { status: 401 });
        }
        
        const user = await UserRepo.getUserById(session.user.id);
        let agent = await UserRepo.getAgentByUserId(session.user.id);
        if (!agent) {
            agent = await UserRepo.createAgent(session.user.id);
        }
        if (agent) {
            agent.interests = agent?.interests ? agent?.interests : [];
            if (typeof agent.interests === 'string') {
                agent.interests = agent.interests.split(',');
            }
            agent.plugins = agent.plugins ? agent.plugins : [];
            if (typeof agent.plugins === 'string') {
                agent.plugins = agent.plugins.split(',');
            }
            const bets_stats = await UserRepo.getBetsStatsByAgentId(agent.id);
            const successRate = bets_stats.win_count / (Number(bets_stats.win_count) + Number(bets_stats.lose_count)) * 100;
            return Response.json({ status: true, agent: agent, successRate: successRate, user: user });
        } else {
            return Response.json({ status: false, message: 'Agent not found' });
        }
    } catch (error) {
        console.error("Error in getAgentProfile: ", error);
        return Response.json({
            status: false,
            message: error instanceof Error ? error.message : 'Internal server error'
        });
    }
}