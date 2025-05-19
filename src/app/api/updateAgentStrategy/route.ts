import { NextRequest } from "next/server";
import { UserRepo } from "@/app/utils/database/user-repo";

export async function POST(req: NextRequest) {
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

    await UserRepo.updateAgent(agent.user_id, {...agent, principles: JSON.stringify(agent.principles), interests: agent.interests.join(',') || ""});
  } catch (error) {
    console.error("Error updating agent strategy:", error);
    return Response.json({ status: false, message: "Failed to update agent strategy" });
  }
  
  return Response.json({ status: true, message: "Agent strategy updated" });
}