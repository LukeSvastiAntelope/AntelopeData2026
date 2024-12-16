import { NextRequest } from "next/server";
import { UserRepo } from "@/app/utils/database/user-repo";
import { createAIPrediction } from "@/app/utils/api/predictionGenerator";
import { AutomatedPrediction } from "@/app/utils/interface";

export async function GET(req: NextRequest) {
    try {
        const agentList = await UserRepo.getAgents();
        let predictions: AutomatedPrediction[] = [];
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
            const prediction = await createAIPrediction(agent);
            prediction.userId = agent.user_id;
            prediction.agentId = agent.id;
            predictions.push(prediction);
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