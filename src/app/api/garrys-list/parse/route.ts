import { NextRequest, NextResponse } from 'next/server';
import { scrapeArticle, inferTopic } from '@/app/utils/services/garrys-list';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * POST /api/garrys-list/parse
 *
 * Step 1 of the no-login flow: read the pasted story URL, extract its text,
 * and infer a topic + suggested title to pre-fill the Setup Screen.
 * Public — no auth required (the whole point is "no log in required").
 *
 * Body: { url: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const url = String(body?.url || '').trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      return NextResponse.json({ status: false, message: 'Enter a valid story URL (starting with http:// or https://).' }, { status: 400 });
    }

    const article = await scrapeArticle(url);
    const { topic, suggestedTitle } = await inferTopic(article.text, article.title || 'Reader survey');

    return NextResponse.json({
      status: true,
      url,
      storyTitle: article.title || suggestedTitle,
      topic,
      suggestedTitle,
      // Truncated story text round-trips through the client to the /generate
      // call — keeps this route stateless with no temp-storage table needed.
      storyText: article.text,
    });
  } catch (error) {
    console.error('garrys-list parse error:', error);
    return NextResponse.json(
      { status: false, message: error instanceof Error ? error.message : 'Failed to read that URL' },
      { status: 400 }
    );
  }
}
