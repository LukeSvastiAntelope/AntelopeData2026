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

    const requestBody = await req.json();
    console.log('Received request body:', JSON.stringify(requestBody, null, 2));
    
    // Handle both formats: { agent: {...} } and direct agent object
    const agent = requestBody.agent || requestBody;

    try {
        // Validate required fields
        if (!agent.name || agent.name.trim() === '') {
            console.error('Missing or empty agent name');
            return Response.json({ 
                status: false, 
                message: "Agent name is required" 
            }, { status: 400 });
        }

        // Get user ID from JWT payload (stored in email field)
        const userId = (jwtPayload.id || jwtPayload.user_id || jwtPayload.email) as number;
        if (!userId) {
            console.error('No user ID found in JWT payload:', jwtPayload);
            return Response.json({ 
                status: false, 
                message: "User ID not found in token" 
            }, { status: 400 });
        }

        // Ensure image is not empty
        if (!agent.image || agent.image.trim() === '') {
            // Generate a placeholder avatar if none is provided
            agent.image = `https://api.dicebear.com/7.x/bottts/svg?seed=agent${userId}`;
        }

        const updateParams: Partial<IFormDataAgentProfile> = {
            id: agent.id,
            user_id: userId,
            name: agent.name,
            description: agent.description || '',
            maxBetSize: agent.maxBetSize || 100,
            interests: Array.isArray(agent.interests) ? agent.interests.join(',') : (agent.interests || ''),
            riskLevel: agent.riskLevel || 'Moderate',
            conservativeBetSize: agent.conservativeBetSize || 10,
            moderateBetSize: agent.moderateBetSize || 25,
            aggressiveBetSize: agent.aggressiveBetSize || 50,
            principles: agent.principles || '',
            image: agent.image,
            maxTimelineLimit: agent.maxTimelineLimit || 30,
            category: agent.category || 'General',
            sport_preference: agent.sport_preference,
            model: agent.model || 'gpt-4o',
            plugins: Array.isArray(agent.plugins) ? agent.plugins.join(',') : (agent.plugins || ''),
            is_bet: agent.is_bet !== undefined ? agent.is_bet : 1,
            is_onboarded: agent.is_onboarded !== undefined ? agent.is_onboarded : false
        };

        // Ensure sport_preference is only set if category is Sports
        if (updateParams.category !== "Sports") {
            delete updateParams.sport_preference; 
        }

        console.log('Update params:', JSON.stringify(updateParams, null, 2));
        console.log('Using user ID:', userId);

        await UserRepo.updateAgent(userId.toString(), updateParams as IFormDataAgentProfile);
        return Response.json({ status: true, message: "update profile successfully" });
    } catch (error) {
        console.log("Error in saveAgentProfile: ", error);
        return Response.json({ status: false, message: error });
    }
};