import { NextRequest, NextResponse } from "next/server";
import { UserRepo } from "@/app/utils/database/user-repo";
import { IAgentProfile, AgentDB } from "@/app/utils/interface";

export async function GET(req: NextRequest) {
  try {
    const agentsFromDB: AgentDB[] = await UserRepo.getAgents(); // Corrected to use existing getAgents method

    const formattedAgents: IAgentProfile[] = agentsFromDB.map(agent => {
      let interestsArray: string[] = [];
      if (typeof agent.interests === 'string') {
        interestsArray = agent.interests.split(',').map((interest: string) => interest.trim()).filter((interest: string) => interest);
      } else if (Array.isArray(agent.interests)) {
        interestsArray = agent.interests; // Use as is if already an array
      }

      let pluginsArray: string[] = [];
      if (typeof agent.plugins === 'string') {
        pluginsArray = agent.plugins.split(',').map((p: string) => p.trim()).filter((p: string) => p);
      } else if (Array.isArray(agent.plugins)) {
        pluginsArray = agent.plugins; // Use as is if already an array
      }

      // Ensure all other fields from AgentDB are correctly mapped to IAgentProfile
      return {
        ...(agent as any), // Cast to any to spread, then override specific fields
        user_id: typeof agent.user_id === 'string' ? parseInt(agent.user_id, 10) : agent.user_id,
        interests: interestsArray,
        plugins: pluginsArray,
      } as IAgentProfile; // Assert the final object shape
    });

    return NextResponse.json({ status: true, users: formattedAgents });
  } catch (error) {
    console.error("Error fetching users for admin:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return NextResponse.json({ status: false, message: "Failed to fetch users", error: errorMessage }, { status: 500 });
  }
} 