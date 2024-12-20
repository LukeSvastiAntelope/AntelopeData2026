import { UserRepo } from "@/app/utils/database/user-repo";
import { BetDecision, Prediction } from "@/app/utils/interface";
import { automaticBettingOnList } from "@/app/utils/api/automaticBetting";

export async function GET() {
    try {
        const agentList = await UserRepo.getAgents();
        const predictions = await UserRepo.getOpenPredictions();
        
        const bets: BetDecision[] = [];

        for (const agent of agentList) {
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
            const agentBets = await automaticBettingOnList(agent, predictions as Prediction[]);
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