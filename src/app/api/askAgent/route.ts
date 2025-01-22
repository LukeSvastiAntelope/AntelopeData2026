import { NextRequest, NextResponse } from "next/server";
import { AutomaticBettingAgent } from "@/app/utils/api/automaticBetting";
import { IAgentProfile } from "@/app/utils/interface";
import { UserRepo } from "@/app/utils/database/user-repo";

export async function POST(request: NextRequest) {
  try {
    const { userQuestion, agentProfile } = (await request.json()) as {
      userQuestion: string;
      agentProfile: IAgentProfile;
    };

    if (!userQuestion || !agentProfile) {
      throw new Error("Missing userQuestion or agentProfile in request body");
    }
    
    await UserRepo.insertConversation(agentProfile.user_id, agentProfile.id, userQuestion, "user");

    // Create an Agent instance with the user-provided agentProfile
    const agent = new AutomaticBettingAgent({
      id: agentProfile.id,
      name: agentProfile.name,
      description: agentProfile.description,
      image: agentProfile.image,
      maxBetSize: agentProfile.maxBetSize,
      interests: agentProfile.interests,
      principles: agentProfile.principles,
      wallet_balance: agentProfile.wallet_balance,
      user_id: agentProfile.user_id,
      category: agentProfile.category,
      maxTimelineLimit: agentProfile.maxTimelineLimit,
      riskLevel: agentProfile.riskLevel,
      conservativeBetSize: agentProfile.conservativeBetSize,
      moderateBetSize: agentProfile.moderateBetSize,
      aggressiveBetSize: agentProfile.aggressiveBetSize,
      nft_address: agentProfile.nft_address,
      trainCount: agentProfile.trainCount,
      train_index: agentProfile.train_index,
      platform_id: agentProfile.platform_id
    });

    // Pass the question to our agent
    const answer = await agent.handleUserQuestion(userQuestion);
    await UserRepo.insertConversation(agentProfile.user_id, agentProfile.id, answer, "agent");

    return NextResponse.json({ status: true, answer }, { status: 200 });
  } catch (error) {
    console.error("Error in askAgent API:", error);
    return NextResponse.json(
      { status: false, message: String(error) },
      { status: 500 }
    );
  }
} 