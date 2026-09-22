import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/app/utils/auth/require-user';
import { auth } from '@/auth';
import {
  assistVideoPrompt,
  VIDEO_TEMPLATES,
} from '@/app/utils/services/video/prompt-assist';
import {
  getDefaultVideoProviderId,
  listVideoProviders,
  type VideoGenMode,
  type VideoProviderId,
} from '@/app/utils/services/video/providers';

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
    templates: VIDEO_TEMPLATES,
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
    const plainDescription = String(body.plainDescription || body.prompt || '').trim();
    if (!plainDescription) {
      return NextResponse.json(
        { error: 'plainDescription is required' },
        { status: 400 }
      );
    }
    const provider = (body.provider || getDefaultVideoProviderId()) as VideoProviderId;
    const mode = (body.mode || 't2v') as VideoGenMode;

    const assisted = await assistVideoPrompt({
      plainDescription,
      provider,
      mode,
      templateId: body.templateId,
      aspectRatio: body.aspectRatio,
      durationSeconds: body.durationSeconds,
      hasReferenceImage: Boolean(body.referenceImage || body.hasReferenceImage),
      hasReferenceVideo: Boolean(body.referenceVideo || body.hasReferenceVideo),
    });

    return NextResponse.json({ ok: true, assisted });
  } catch (error) {
    console.error('[video/prompt-assist]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Prompt assist failed' },
      { status: 500 }
    );
  }
}
