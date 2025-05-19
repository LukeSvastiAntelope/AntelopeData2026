import { NextRequest } from "next/server";
import OpenAI from "openai";

// Initialize OpenAI using the same pattern as training/route.ts
const openaiClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function POST(req: NextRequest) {
  try {
    // No authentication check - this endpoint is accessible without auth for profile setup
    const { category, interests } = await req.json();
    
    // Format interests for better prompting
    const interestsText = interests && interests.length > 0 
      ? `and specifically interested in ${interests.join(', ')}` 
      : '';
    
    const prompt = `Generate a creative name and brief description for an AI prediction agent focused on ${category || 'general topics'} ${interestsText}. 
    
    The agent will be used for making market predictions and bets in a prediction market platform.
    
    The name should be catchy, memorable, and reflect the agent's focus area. Keep the name under 30 characters.
    
    The description should be 1-2 very concise sentences explaining the agent's prediction style, focus, and "personality". IMPORTANT: The description must be UNDER 200 CHARACTERS total due to database constraints.
    
    Please respond in JSON format only like this:
    {
      "name": "Agent Name",
      "description": "Brief 1-2 sentence description that explains the agent's prediction approach.",
      "avatarPrompt": "A detailed description that could be used for generating an avatar image for this agent"
    }`;

    // Call OpenAI with the prompt using the client instance pattern from training/route.ts
    const completion = await openaiClient.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "gpt-4o",
      response_format: { type: "json_object" },
    });

    // Extract the result
    const responseContent = completion.choices[0].message.content;
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