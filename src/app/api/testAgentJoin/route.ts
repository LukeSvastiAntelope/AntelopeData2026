import { NextRequest } from "next/server";
import { UserRepo } from "@/app/utils/database/user-repo";

export async function GET(req: NextRequest) {
    try {
        const searchParams = req.nextUrl.searchParams;
        // Use query parameters if provided, otherwise use defaults
        const userId = searchParams.get('userId') || "1615"; // This should match the logged in user ID from the token
        const name = searchParams.get('name') || "TestAgent";
        const description = searchParams.get('description') || "This is a test agent with a description that should appear in the feed!";
        
        console.log("Test endpoint creating agent join action with:", { name, description });
        
        const actionDescription = `Agent ${name} just joined. ${description}`;
        const type = "agent_join";
        
        await UserRepo.createAgentJoinAction(userId, actionDescription, type);
        
        return Response.json({ 
            status: true, 
            message: "Test agent join action created successfully",
            actionDescription,
            params: { userId, name, description }
        });
    } catch (error) {
        console.log("Error in testAgentJoin: ", error);
        return Response.json({ status: false, message: error });
    }
}; 