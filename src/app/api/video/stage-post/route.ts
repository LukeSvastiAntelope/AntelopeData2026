import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { ConsultantRepo } from '@/app/utils/database/consultant-repo';
import { executeTool } from '@/app/utils/services/tools/executor';

/**
 * Stage a generated video for the human post gate (generate_and_post_video).
 * Never posts — only creates a pending staged action / approval card.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    let userId = session?.user?.id ? Number(session.user.id) : NaN;
    if (!Number.isFinite(userId)) {
      const header = req.headers.get('x-user-id');
      userId = header ? Number(header) : NaN;
    }
    if (!Number.isFinite(userId) || userId <= 0) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const videoUrl = String(body.videoUrl || '').trim();
    if (!videoUrl) {
      return NextResponse.json({ error: 'videoUrl is required' }, { status: 400 });
    }
    const orgId =
      body.organizationId != null && Number.isFinite(Number(body.organizationId))
        ? Number(body.organizationId)
        : null;

    const input = {
      videoUrl,
      caption: body.caption || '',
      platform: body.platform || 'tiktok',
      script: body.script || body.prompt || '',
      provider: body.provider || undefined,
    };

    const toolResult = await executeTool(
      { name: 'generate_and_post_video', input },
      { userId, organizationId: orgId }
    );

    if (!(toolResult.ok && toolResult.status === 'pending_approval')) {
      return NextResponse.json(
        {
          error: 'Expected pending_approval from generate_and_post_video',
          toolResult,
        },
        { status: 500 }
      );
    }

    const conversation = await ConsultantRepo.getOrCreateConversation({
      userId,
      organizationId: orgId,
    });
    const staged = await ConsultantRepo.createStagedAction({
      conversationId: conversation.id,
      toolName: toolResult.tool,
      summary: toolResult.summary,
      payload: {
        tool: toolResult.tool,
        input: toolResult.staged.input,
        description: toolResult.staged.description,
        videoUrl,
      },
    });

    const messages = [
      ...conversation.messages,
      {
        role: 'assistant' as const,
        content: [
          '### Video ready — review before it goes out',
          toolResult.summary,
          '',
          '_Nothing posts until you Approve on the card._',
        ].join('\n'),
        meta: {
          kind: 'staged_notice' as const,
          toolName: toolResult.tool,
          risk: 'approval' as const,
          stagedActionId: staged.id,
        },
        createdAt: new Date().toISOString(),
      },
    ];
    await ConsultantRepo.saveMessages(conversation.id, userId, messages);

    return NextResponse.json({
      ok: true,
      staged,
      conversationId: conversation.id,
    });
  } catch (error) {
    console.error('[video/stage-post]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Stage failed' },
      { status: 500 }
    );
  }
}
