import { NextRequest } from "next/server";
import { UserRepo } from "@/app/utils/database/user-repo";

export async function POST(req: NextRequest) {
  const { agent } = await req.json();

  try {
    await UserRepo.updateAgent(agent.user_id, {...agent, principles: JSON.stringify(agent.principles), interests: agent.interests.join(',') || ""});
  } catch (error) {
    console.error("Error updating agent strategy:", error);
    return Response.json({ status: false, message: "Failed to update agent strategy" });
  }
  
  return Response.json({ status: true, message: "Agent strategy updated" });
}