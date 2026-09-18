import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { startClipJob } from '@/app/utils/services/video/clip-service';
import {
  getDefaultClipProviderId,
  listClipProviders,
  type VideoClipProviderId,
} from '@/app/utils/services/video/clippers';
import { assertOwnAssetUse } from '@/app/utils/services/video/guardrails';

async function resolveUserId(req: NextRequest): Promise<number | null> {
  const session = await auth();
  if (session?.user?.id && Number.isFinite(Number(session.user.id))) {
    return Number(session.user.id);
  }
  const header = req.headers.get('x-user-id');
  if (header && Number.isFinite(Number(header))) return Number(header);
  return null;
}

export async function GET() {
  return NextResponse.json({
    providers: listClipProviders(),
    defaultProvider: getDefaultClipProviderId(),
  });
}

export async function POST(req: NextRequest) {
  try {
    const userId = await resolveUserId(req);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = await req.json().catch(() => ({}));
    const sourceUrl = String(body.sourceUrl || body.url || '').trim();
    if (!sourceUrl) {
      return NextResponse.json({ error: 'sourceUrl is required' }, { status: 400 });
    }

    const guard = assertOwnAssetUse({
      prompt: body.notes || '',
      caption: body.caption || '',
    });
    if (!guard.ok) {
      return NextResponse.json({ error: guard.reason }, { status: 400 });
    }

    const job = await startClipJob({
      userId,
      sourceUrl,
      provider: (body.provider as VideoClipProviderId) || undefined,
      language: body.language,
      maxClips: body.maxClips,
      maxDurationSeconds: body.maxDurationSeconds,
      topicKeywords: Array.isArray(body.topicKeywords)
        ? body.topicKeywords.map(String)
        : undefined,
    });

    return NextResponse.json({ ok: true, job });
  } catch (error) {
    console.error('[video/clip]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Clip submit failed' },
      { status: 500 }
    );
  }
}
