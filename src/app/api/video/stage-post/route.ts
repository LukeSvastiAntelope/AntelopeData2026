import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/app/utils/auth/require-user';
import { auth } from '@/auth';
import { ConsultantRepo } from '@/app/utils/database/consultant-repo';
import { executeTool } from '@/app/utils/services/tools/executor';
import {
  AI_DISCLOSURE_DEFAULT,
  assertOwnAssetUse,
} from '@/app/utils/services/video/guardrails';

/**
 * Stage a generated/clipped video for the human post gate (generate_and_post_video).
 * Never posts — only creates a pending staged action / approval card.
 * Surfaces AI disclosure affordance at this post step.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    let userId = session?.user?.id ? Number(session.user.id) : NaN;
    if (!Number.isFinite(userId)) {
      const authResult = requireUserId(req);
      userId = typeof authResult === 'string' ? Number(authResult) : NaN;
    }
    if (!Number.isFinite(userId) || userId <= 0) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const videoUrl = String(body.videoUrl || '').trim();
    if (!videoUrl) {
      return NextResponse.json({ error: 'videoUrl is required' }, { status: 400 });
    }

    const guard = assertOwnAssetUse({
      prompt: body.script || body.prompt || '',
      caption: body.caption || '',
    });
    if (!guard.ok) {
      return NextResponse.json({ error: guard.reason }, { status: 400 });
    }

    const orgId =
      body.organizationId != null && Number.isFinite(Number(body.organizationId))
        ? Number(body.organizationId)
        : null;

    const includeAiDisclosure =
      body.includeAiDisclosure === undefined ? true : Boolean(body.includeAiDisclosure);

    const input = {
      videoUrl,
      caption: body.caption || '',
      platform: body.platform || 'tiktok',
      script: body.script || body.prompt || body.hook || '',
      provider: body.provider || undefined,
      includeAiDisclosure,
      aiDisclosureText: body.aiDisclosureText || AI_DISCLOSURE_DEFAULT,
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
        includeAiDisclosure,
      },
    });

    const messages = [
      ...conversation.messages,
      {
        role: 'assistant' as const,
        content: [
          '### Video ready — review before it goes out',
          toolResult.summary,
          includeAiDisclosure
            ? `_AI disclosure will be included: "${AI_DISCLOSURE_DEFAULT}"_`
            : null,
          '',
          '_Nothing posts until you Approve on the card._',
        ]
          .filter(Boolean)
          .join('\n'),
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
      includeAiDisclosure,
      disclosureText: AI_DISCLOSURE_DEFAULT,
    });
  } catch (error) {
    console.error('[video/stage-post]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Stage failed' },
      { status: 500 }
    );
  }
}
