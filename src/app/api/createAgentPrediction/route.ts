export const dynamic = 'force-dynamic'

import { UserRepo } from "@/app/utils/database/user-repo";
import { createAIPrediction } from "@/app/utils/api/predictionGenerator";
import { IAgentProfile } from "@/app/utils/interface";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
    const agent_id = req.nextUrl.searchParams.get('agentId');
    try {
        const agent = await UserRepo.getAgentById(Number(agent_id));
        if (!agent) {
            return Response.json({ status: false, message: 'Agent not found' });
        }
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
        const prediction = await createAIPrediction(agent as unknown as IAgentProfile);
        return Response.json({ status: true, prediction: prediction });
    } catch (error) {
        console.error("Error in createAgentPrediction: ", error);
        return Response.json({
            status: false,
            message: error instanceof Error ? error.message : 'Internal server error'
        });
    }
}