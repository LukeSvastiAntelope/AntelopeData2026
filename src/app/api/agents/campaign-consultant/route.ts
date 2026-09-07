import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import {
  consultantOfflineFallback,
  runCampaignConsultantTurn,
  type CampaignBrief,
  type ConsultantMessage,
} from '@/app/utils/services/campaign-consultant-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const messages = (body?.messages || []) as ConsultantMessage[];
    const brief = (body?.brief || null) as CampaignBrief | null;
    const latestUser = [...messages].reverse().find((m) => m.role === 'user')?.content?.trim();

    if (!latestUser) {
      return NextResponse.json({ error: 'Message required' }, { status: 400 });
    }

    const hasKey = Boolean(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY);
    if (!hasKey) {
      return NextResponse.json({
        status: true,
        ...consultantOfflineFallback(latestUser),
        offline: true,
      });
    }

    try {
      const result = await runCampaignConsultantTurn({ messages, brief });
      return NextResponse.json({ status: true, ...result, offline: false });
    } catch (error) {
      console.error('Campaign consultant AI error:', error);
      return NextResponse.json({
        status: true,
        ...consultantOfflineFallback(latestUser),
        offline: true,
        warning: 'AI provider failed; returned setup guidance instead.',
      });
    }
  } catch (error) {
    console.error('Campaign consultant route error:', error);
    return NextResponse.json({ error: 'Failed to run consultant agent' }, { status: 500 });
  }
}
