import { NextRequest } from "next/server";
import OpenAI from "openai";
import { downloadAndSaveImage } from "@/app/utils/imageUtils";

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is missing");
  return new OpenAI({ apiKey });
}

export async function POST(req: NextRequest) {
  try {
    // No authentication check - this endpoint is accessible without auth for avatar setup
    const { name, category, avatarPrompt, userId } = await req.json();
    
    // Create a prompt for DALL-E that generates a suitable avatar based on the inputs
    let prompt = `Create a professional, unique avatar for a prediction agent named "${name}" with focus on ${category || 'general topics'}.`;
    
    // If we have a specific avatar prompt provided by the LLM, use it
    if (avatarPrompt && avatarPrompt.length > 0) {
      prompt = `Create a professional avatar: ${avatarPrompt}. Suitable for a prediction agent in ${category || 'general topics'}.`;
    }
    
    console.log("Image generation prompt:", prompt);
    
    try {
      // Generate image using DALL-E
      const response = await getOpenAIClient().images.generate({
        model: "dall-e-3", // Use DALL-E 3 for higher quality
        prompt: prompt,
        n: 1,
        size: "1024x1024",
        quality: "standard",
      });
      
      const imageUrl = response?.data?.[0]?.url;
      
      if (!imageUrl) {
        throw new Error("No image was generated");
      }
      
      console.log("Successfully generated image with DALL-E");
      
      // Download and save the DALL-E image permanently
      let permanentImageUrl = imageUrl;
      if (userId) {
        try {
          permanentImageUrl = await downloadAndSaveImage(imageUrl, userId);
          console.log("Image saved permanently to:", permanentImageUrl);
        } catch (saveError) {
          console.error("Failed to save image permanently, using temporary URL:", saveError);
          // Continue with temporary URL if save fails
        }
      }
      
      return Response.json({ 
        status: true, 
        avatarUrl: permanentImageUrl
      });
    } catch (openaiError) {
      console.error("OpenAI image generation failed:", openaiError);
      
      // Fall back to DiceBear if OpenAI fails
      console.log("Falling back to DiceBear avatar");
      const formattedName = name.replace(/\s+/g, '-').toLowerCase();
      let style = 'bottts';
      
      if (category?.toLowerCase().includes('sports')) {
        style = 'avataaars';
      } else if (category?.toLowerCase().includes('crypto') || category?.toLowerCase().includes('tech')) {
        style = 'micah';
      } else if (category?.toLowerCase().includes('politics') || category?.toLowerCase().includes('general')) {
        style = 'personas';
      }
      
      const fallbackUrl = `https://api.dicebear.com/7.x/${style}/svg?seed=${formattedName}`;
      
      return Response.json({ 
        status: true, 
        avatarUrl: fallbackUrl,
        used_fallback: true
      });
    }
  } catch (error) {
    console.error("Error generating agent avatar:", error);
    
    // Ultimate fallback - return a generic DiceBear avatar
    const fallbackUrl = "https://api.dicebear.com/7.x/bottts/svg?seed=fallback-agent";
    
    return Response.json({ 
      status: true, 
      avatarUrl: fallbackUrl,
      used_fallback: true,
      error: error instanceof Error ? error.message : "Unknown error" 
    });
  }
} 