import { NextRequest } from "next/server";
import { UserRepo } from "@/app/utils/database/user-repo";
import { verifyConfirmationToken } from "@/app/utils/api/token"
import { IFormDataAgentProfile } from "@/app/utils/interface";

export async function POST(req: NextRequest) {
    const token = req.headers.get('Authorization')?.split(' ')[1];
    const jwtPayload = await verifyConfirmationToken(token as string);
    if (!jwtPayload) {
        return Response.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { agent } = await req.json();

    try {
        // Validate required fields
        if (!agent.name || agent.name.trim() === '') {
            return Response.json({ 
                status: false, 
                message: "Agent name is required" 
            }, { status: 400 });
        }

        // Ensure image is not empty
        if (!agent.image || agent.image.trim() === '') {
            // Generate a placeholder avatar if none is provided
            agent.image = `https://api.dicebear.com/7.x/bottts/svg?seed=agent${agent.user_id}`;
        }

        const updateParams: Partial<IFormDataAgentProfile> = {
            id: agent.id,
            user_id: agent.user_id,
            name: agent.name,
            description: agent.description,
            maxBetSize: agent.maxBetSize,
            interests: agent.interests.join(','),
            riskLevel: agent.riskLevel,
            conservativeBetSize: agent.conservativeBetSize,
            moderateBetSize: agent.moderateBetSize,
            aggressiveBetSize: agent.aggressiveBetSize,
            principles: agent.principles,
            image: agent.image,
            maxTimelineLimit: agent.maxTimelineLimit,
            category: agent.category,
            sport_preference: agent.sport_preference,
            model: agent.model,
            plugins: agent.plugins.join(','),
            is_bet: agent.is_bet,
            is_onboarded: agent.is_onboarded
        };

        // Ensure sport_preference is only set if category is Sports
        if (updateParams.category !== "Sports") {
            delete updateParams.sport_preference; 
        }

        await UserRepo.updateAgent(jwtPayload.email as string, updateParams as IFormDataAgentProfile);
        return Response.json({ status: true, message: "update profile successfully" });
    } catch (error) {
        console.log("Error in saveAgentProfile: ", error);
        return Response.json({ status: false, message: error });
    }
};