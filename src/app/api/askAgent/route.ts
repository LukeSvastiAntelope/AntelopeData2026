import { NextRequest, NextResponse } from "next/server";
import { AutomaticBettingAgent } from "@/app/utils/api/automaticBetting";
import { IPrinciple } from "@/app/utils/interface";
import { UserRepo } from "@/app/utils/database/user-repo";
import { OpenAI } from "openai";

const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY!,
  baseURL: 'https://api.deepseek.com'
});

export async function POST(request: NextRequest) {
  try {
    const { userQuestion, agentProfileId } = (await request.json()) as {
      userQuestion: string;
      agentProfileId: string;
    };

    if (!userQuestion || !agentProfileId) {
      throw new Error("Missing userQuestion or agentProfileId in request body");
    }

    const agentProfile = await UserRepo.getAgentById(Number(agentProfileId));
    if (!agentProfile) {
      throw new Error("Agent profile not found");
    }

    await UserRepo.insertConversation(agentProfile.user_id, agentProfile.id, userQuestion, "user");

    if (typeof agentProfile.interests === "string") {
      agentProfile.interests = agentProfile.interests.split(",");
    }

    try {
      if (typeof agentProfile.principles === 'string') {
        agentProfile.principles = JSON.parse(agentProfile.principles);
      }
      if (!Array.isArray(agentProfile.principles)) {
        agentProfile.principles = [];
      }
    } catch (e) {
      console.log("Error in principles: ", e);
      agentProfile.principles = [];
    }

    // Create an Agent instance with the user-provided agentProfile
    const agent = new AutomaticBettingAgent({
      id: agentProfile.id,
      name: agentProfile.name,
      description: agentProfile.description,
      image: agentProfile.image,
      maxBetSize: agentProfile.maxBetSize,
      interests: agentProfile.interests,
      principles: agentProfile.principles as unknown as IPrinciple[],
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
      platform_id: agentProfile.platform_id,
      is_bet: agentProfile.is_bet
    });

    // Pass the question to our agent
    const messages = await agent.handleUserQuestion(userQuestion);

    const stream = await deepseek.chat.completions.create({
      model: "deepseek-chat",
      messages: messages,
      temperature: 0.4,
      stream: true
    });

    const encoder = new TextEncoder();
    let fullResponse = "";

    const streamResponse = new ReadableStream({
      async start(controller) {
        try {
          // Iterate over each streamed chunk
          for await (const chunk of stream) {
            const data = chunk as { choices?: { delta?: { content?: string } }[] };
            // Cerebras returns the text in data.choices[0]?.delta?.content
            const content = data.choices?.[0]?.delta?.content || "";
            if (content) {
              fullResponse += content;
              controller.enqueue(encoder.encode(content));
              await new Promise(resolve => setTimeout(resolve, 5));
            }
          }
        } catch (error) {
          console.error("Streaming error: ", error);
        }
        controller.close();
      },
    });

    await UserRepo.insertConversation(agentProfile.user_id, agentProfile.id, fullResponse, "agent");
    return new NextResponse(streamResponse);
  } catch (error) {
    console.error("Error in askAgent API:", error);
    return new NextResponse(error instanceof Error ? error.message : "An error occurred", { status: 500 });
  }
} 