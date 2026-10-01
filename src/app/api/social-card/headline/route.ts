import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { createCompletion } from '@/app/utils/services/ai-service';
import { withUserOrgAiUsage } from '@/app/utils/services/with-org-ai-usage';

/**
 * POST /api/social-card/headline — cheap-tier headline from a finding claim.
 * Numbers must already be in the claim; the model must not invent statistics.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const claim = String(body.claim || body.finding || '').trim();
    const sourceLine = String(body.sourceLine || '').trim();
    const caveat = String(body.caveat || '').trim();
    if (!claim) {
      return NextResponse.json({ error: 'claim is required' }, { status: 400 });
    }

    const completion = await withUserOrgAiUsage(
      session.user.id,
      'content.headline',
      () =>
        createCompletion({
          tier: 'cheap',
          maxTokens: 200,
          expandOnTruncation: true,
          messages: [
            {
              role: 'system',
              content:
                'You write short social-card headlines for political campaigns. Return ONLY the headline text (max 14 words). Use only facts present in the claim. Never invent percentages, sample sizes, or statistics. Do not add hashtags or emoji.',
            },
            {
              role: 'user',
              content: [
                `Claim: ${claim}`,
                sourceLine ? `Source: ${sourceLine}` : null,
                caveat ? `Caveat (do not contradict): ${caveat}` : null,
                'Headline:',
              ]
                .filter(Boolean)
                .join('\n'),
            },
          ],
        })
    );

    if (completion.stopReason === 'max_tokens') {
      return NextResponse.json(
        { error: 'Headline was truncated; please retry' },
        { status: 502 }
      );
    }

    let headline = (completion.content || '').trim().replace(/^["']|["']$/g, '');
    // Strip accidental labels
    headline = headline.replace(/^headline:\s*/i, '').trim();
    if (!headline) {
      headline = claim.slice(0, 80);
    }

    return NextResponse.json({
      headline,
      model: completion.model,
    });
  } catch (error) {
    console.error('[social-card/headline]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Headline failed' },
      { status: 500 }
    );
  }
}
