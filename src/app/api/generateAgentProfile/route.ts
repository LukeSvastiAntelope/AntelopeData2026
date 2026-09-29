import { NextRequest } from "next/server";
import { createCompletion } from "@/app/utils/services/ai-service";

export async function POST(req: NextRequest) {
  try {
    // No authentication check - this endpoint is accessible without auth for profile setup
    const { category, interests } = await req.json();
    
    // Format interests for better prompting
    const interestsText = interests && interests.length > 0 
      ? `and specifically interested in ${interests.join(', ')}` 
      : '';
    
    const prompt = `Generate a creative name and brief description for an AI survey analyst focused on ${category || 'general topics'} ${interestsText}. 
    
    The agent will be used for analyzing political surveys, voter insights, and campaign data.
    
    The name should be catchy, memorable, and reflect the agent's focus area. Keep the name under 30 characters.
    
    The description should be 1-2 very concise sentences explaining the agent's analysis style, focus, and "personality". IMPORTANT: The description must be UNDER 200 CHARACTERS total due to database constraints.
    
    Please respond in JSON format only like this:
    {
      "name": "Agent Name",
      "description": "Brief 1-2 sentence description that explains the agent's analysis approach.",
      "avatarPrompt": "A detailed description that could be used for generating an avatar image for this agent"
    }`;

    const completion = await createCompletion({
      tier: 'cheap',
      maxTokens: 500,
      messages: [{ role: "user", content: prompt }],
    });

    const responseContent = (completion.content || '{}').replace(/```json\n?|\n?```/g, '').trim();
    const agentProfile = JSON.parse(responseContent || '{}');
    
    // Ensure the description is under the database limit (truncate if needed)
    if (agentProfile.description && agentProfile.description.length > 200) {
      agentProfile.description = agentProfile.description.substring(0, 197) + '...';
    }
    
    return Response.json({ 
      status: true, 
      profile: agentProfile 
    });
  } catch (error) {
    console.error("Error generating agent profile:", error);
    return Response.json({ 
      status: false, 
      message: "Failed to generate agent profile",
      error: error instanceof Error ? error.message : "Unknown error" 
    }, { status: 500 });
  }
}
