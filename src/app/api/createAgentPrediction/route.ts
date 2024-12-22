export const dynamic = 'force-dynamic'

import { UserRepo } from "@/app/utils/database/user-repo";
import { createAIPrediction } from "@/app/utils/api/predictionGenerator";
import { AutomatedPrediction, IAgentProfile } from "@/app/utils/interface";

export async function GET() {
    try {
        const agentList = await UserRepo.getAgents();
        const predictions: AutomatedPrediction[] = [];
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
            const prediction = await createAIPrediction(agent as unknown as IAgentProfile);
            if (prediction) {
                prediction.userId = agent.user_id;
                prediction.agentId = agent.id;
                predictions.push(prediction);
            }
        }
        return Response.json({ status: true, predictions: predictions });
    } catch (error) {
        console.error("Error in getAgentProfile: ", error);
        return Response.json({
            status: false,
            message: error instanceof Error ? error.message : 'Internal server error'
        });
    }
}