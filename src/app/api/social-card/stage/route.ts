import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/app/utils/auth/require-user';
import { auth } from '@/auth';
import { ConsultantRepo } from '@/app/utils/database/consultant-repo';
import { executeTool } from '@/app/utils/services/tools/executor';
import { SMALL_SAMPLE_DISCLAIMER } from '@/app/utils/services/autotrigger-outputs';
import { resolveActiveOrgForUser } from '@/app/utils/auth/resolve-active-org';

/**
 * Stage a social card image for the human post gate (post_social_card).
 * Never posts — only creates a pending staged action.
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
    const mediaUrl = String(body.mediaUrl || '').trim();
    const storageKey = String(body.storageKey || '').trim();
    if (!mediaUrl && !storageKey) {
      return NextResponse.json(
        { error: 'mediaUrl or storageKey is required' },
        { status: 400 }
      );
    }

    if (body.caveatRequired && !String(body.caveat || '').trim()) {
      return NextResponse.json(
        {
          error:
            'A small-sample / directional caveat is required for this finding and cannot be omitted.',
        },
        { status: 400 }
      );
    }

    const orgId = await resolveActiveOrgForUser(
      req,
      userId,
      body.organizationId
    );
    if (orgId instanceof NextResponse) return orgId;

    const caveat = String(body.caveat || '').trim() || null;
    let caption = String(body.caption || body.headline || '').trim();
    if (caveat && !caption.toLowerCase().includes('small-sample')) {
      caption = `${caption}\n\n${caveat || SMALL_SAMPLE_DISCLAIMER}`.trim();
    }

    const input = {
      mediaUrl: mediaUrl || storageKey,
      storageKey: storageKey || undefined,
      caption,
      headline: body.headline || '',
      platform: body.platform || 'linkedin',
      caveat: caveat || undefined,
      format: body.format || undefined,
      sourceLine: body.sourceLine || undefined,
    };

    const toolResult = await executeTool(
      { name: 'post_social_card', input },
      { userId, organizationId: orgId }
    );

    if (!(toolResult.ok && toolResult.status === 'pending_approval')) {
      return NextResponse.json(
        {
          error: 'Expected pending_approval from post_social_card',
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
        mediaUrl: mediaUrl || storageKey,
        storageKey: storageKey || null,
        contentType: 'image',
        distributeAs: 'image',
        caption,
        platform: input.platform,
        format: input.format,
        caveat,
      },
    });

    const messages = [
      ...conversation.messages,
      {
        role: 'assistant' as const,
        content: [
          '### Social card ready — review before it goes out',
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
    console.error('[social-card/stage]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Stage failed' },
      { status: 500 }
    );
  }
}
