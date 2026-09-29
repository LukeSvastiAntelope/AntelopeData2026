import { NextRequest } from "next/server";

/**
 * Avatar generation — DiceBear only (Anthropic-only LLM gateway; no OpenAI images).
 */
export async function POST(req: NextRequest) {
  try {
    const { name, category } = await req.json();
    const formattedName = String(name || 'agent').replace(/\s+/g, '-').toLowerCase();
    let style = 'bottts';

    if (category?.toLowerCase().includes('sports')) {
      style = 'avataaars';
    } else if (category?.toLowerCase().includes('crypto') || category?.toLowerCase().includes('tech')) {
      style = 'micah';
    } else if (category?.toLowerCase().includes('politics') || category?.toLowerCase().includes('general')) {
      style = 'personas';
    }

    const avatarUrl = `https://api.dicebear.com/7.x/${style}/svg?seed=${encodeURIComponent(formattedName)}`;

    return Response.json({
      status: true,
      avatarUrl,
      used_fallback: true,
    });
  } catch (error) {
    console.error("Error generating agent avatar:", error);
    const fallbackUrl = "https://api.dicebear.com/7.x/bottts/svg?seed=fallback-agent";
    return Response.json({
      status: true,
      avatarUrl: fallbackUrl,
      used_fallback: true,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
