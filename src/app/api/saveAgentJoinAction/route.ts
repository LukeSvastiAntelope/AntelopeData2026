import { NextRequest } from "next/server";
import { UserRepo } from "@/app/utils/database/user-repo";
import { verifyConfirmationToken } from "@/app/utils/api/token"

export async function POST(req: NextRequest) {
    const token = req.headers.get('Authorization')?.split(' ')[1];
    const jwtPayload = await verifyConfirmationToken(token as string);
    const { name, description } = await req.json();
    
    // Debug log
    console.log("saveAgentJoinAction received:", { name, description });
    
    if (!jwtPayload) {
        return Response.json({ error: 'Invalid token' }, { status: 401 });
    }

    if (!name) {
        return Response.json({ status: false, message: "Agent name is required" }, { status: 400 });
    }

    try {
        // Format a nice announcement with the optional description
        const sanitizedDescription = description ? description.trim() : '';
        const actionDescription = `Agent ${name} just joined. ${sanitizedDescription}`;
        const type = "agent_join";
        
        // Debug log
        console.log("Creating agent join action with description:", actionDescription);
        
        await UserRepo.createAgentJoinAction(jwtPayload.email as string, actionDescription, type);
        return Response.json({ status: true, message: "Agent join action created successfully" });
    } catch (error) {
        console.log("Error in saveAgentJoinAction: ", error);
        return Response.json({ status: false, message: error });
    }
};