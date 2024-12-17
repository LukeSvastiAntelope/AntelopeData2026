import { NextRequest } from "next/server";
import { UserRepo } from "@/app/utils/database/user-repo";
import { BetDecision } from "@/app/utils/interface";
import { automaticBettingOnList } from "@/app/utils/api/automaticBetting";

export async function GET(req: NextRequest) {
    try {
        const agentList = await UserRepo.getAgents();
        const predictions = await UserRepo.getOpenPredictions();
        
        let bets: BetDecision[] = [];

        for (const agent of agentList) {
            agent.interests = agent.interests ? agent.interests.split(',') : [];
            try {
                agent.principles = agent.principles ? JSON.parse(agent.principles) : [];
                if (!Array.isArray(agent.principles)) {
                    agent.principles = [];
                }
            } catch (e) {
                agent.principles = [];
            }
            if (
                agent.maxTimelineLimit == 0 ||
                agent.principles.length == 0 ||
                agent.interests.length == 0 ||
                agent.name == "" ||
                agent.description == "" ||
                agent.maxBetSize == 0
            ) {
                continue;
            }
            const agentBets = await automaticBettingOnList(agent, predictions);
            bets.push(...agentBets);
        }

        return Response.json({ status: true, bets: bets });
    } catch (error) {
        console.error("Error in getAgentProfile: ", error);
        return Response.json({
            status: false,
            message: error instanceof Error ? error.message : 'Internal server error'
        });
    }
}