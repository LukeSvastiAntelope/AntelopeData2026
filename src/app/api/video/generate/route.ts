import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/app/utils/auth/require-user';
import { auth } from '@/auth';
import { startVideoGeneration } from '@/app/utils/services/video/generate-service';
import {
  getDefaultVideoProviderId,
  listVideoProviders,
  type VideoGenMode,
  type VideoProviderId,
} from '@/app/utils/services/video/providers';
import { assertOwnAssetUse } from '@/app/utils/services/video/guardrails';

async function resolveUserId(req: NextRequest): Promise<number | null> {
  const session = await auth();
  if (session?.user?.id && Number.isFinite(Number(session.user.id))) {
    return Number(session.user.id);
  }
  const authResult = requireUserId(req);
  if (typeof authResult === 'string' && Number.isFinite(Number(authResult))) return Number(authResult);
  return null;
}

export async function GET() {
  return NextResponse.json({
    providers: listVideoProviders(),
    defaultProvider: getDefaultVideoProviderId(),
  });
}

export async function POST(req: NextRequest) {
  try {
    const userId = await resolveUserId(req);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = await req.json().catch(() => ({}));
    const prompt = String(body.prompt || body.plainDescription || '').trim();
    const modelPrompt = String(body.modelPrompt || prompt).trim();
    if (!modelPrompt) {
      return NextResponse.json({ error: 'prompt is required' }, { status: 400 });
    }

    const guard = assertOwnAssetUse({ prompt: modelPrompt });
    if (!guard.ok) {
      return NextResponse.json({ error: guard.reason }, { status: 400 });
    }

    const job = await startVideoGeneration({
      userId,
      prompt,
      modelPrompt,
      provider: (body.provider as VideoProviderId) || undefined,
      mode: (body.mode || 't2v') as VideoGenMode,
      aspectRatio: body.aspectRatio || '9:16',
      durationSeconds: body.durationSeconds || 5,
      referenceImage: body.referenceImage || null,
      referenceVideo: body.referenceVideo || null,
      negativePrompt: body.negativePrompt || null,
    });

    return NextResponse.json({ ok: true, job });
  } catch (error) {
    console.error('[video/generate]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Generate failed' },
      { status: 500 }
    );
  }
}
