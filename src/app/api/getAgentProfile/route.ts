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
        let agent = await UserRepo.getAgentByUserId(jwtPayload.email as string);
        if (!agent) {
            agent = await UserRepo.createAgent(jwtPayload.email as string);
        }
        agent.interests = agent.interests ? agent.interests.split(',') : [];
        agent.principles = agent.principles ? JSON.parse(agent.principles) : {};
        return Response.json({status: true, agent: agent});
    } catch (error) {
        console.error("Error in getAgentProfile: ", error);
        return Response.json({ status: false, message: error instanceof Error ? error.message : 'Internal server error' });
    }
}