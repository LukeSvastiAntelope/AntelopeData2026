import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/app/utils/auth/require-user';
import { auth } from '@/auth';
import { ConsultantRepo } from '@/app/utils/database/consultant-repo';
import { executeTool } from '@/app/utils/services/tools/executor';
import { resolveActiveOrgForUser } from '@/app/utils/auth/resolve-active-org';
import {
  assertSocialCardAggregateColumns,
  enforceSocialCardCaveat,
  resolveOwnedSocialCardMedia,
} from '@/app/utils/services/social-card-guards';

/**
 * Stage a social card image for the human post gate (post_social_card).
 * Never posts — only creates a pending staged action.
 *
 * Server enforces: owned storageKey, aggregate-only sourceColumns, caveat from stats.
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

    const owned = resolveOwnedSocialCardMedia({
      userId,
      storageKey: body.storageKey,
      mediaUrl: body.mediaUrl,
    });
    if (owned.ok === false) return owned.response;

    const agg = assertSocialCardAggregateColumns(body.sourceColumns);
    if (agg.ok === false) return agg.response;

    const orgId = await resolveActiveOrgForUser(
      req,
      userId,
      body.organizationId
    );
    if (orgId instanceof NextResponse) return orgId;

    const stats = {
      sampleN:
        body.sampleN != null && Number.isFinite(Number(body.sampleN))
          ? Number(body.sampleN)
          : null,
      pValue:
        body.pValue != null && Number.isFinite(Number(body.pValue))
          ? Number(body.pValue)
          : null,
    };
    // Never trust body.caveatRequired — recompute from stats
    const enforced = enforceSocialCardCaveat({
      stats,
      clientCaveat: body.caveat,
      caption: String(body.caption || body.headline || '').trim(),
    });

    const input = {
      mediaUrl: owned.mediaUrl,
      storageKey: owned.storageKey,
      caption: enforced.caption,
      headline: body.headline || '',
      platform: body.platform || 'linkedin',
      caveat: enforced.caveat || undefined,
      format: body.format || undefined,
      sourceLine: body.sourceLine || undefined,
      sampleN: stats.sampleN,
      pValue: stats.pValue,
      sourceColumns: agg.columns,
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
        mediaUrl: owned.mediaUrl,
        storageKey: owned.storageKey,
        contentType: 'image',
        distributeAs: 'image',
        caption: enforced.caption,
        platform: input.platform,
        format: input.format,
        caveat: enforced.caveat,
        caveatRequired: enforced.required,
        sampleN: stats.sampleN,
        pValue: stats.pValue,
        sourceColumns: agg.columns,
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
      caveatRequired: enforced.required,
    });
  } catch (error) {
    console.error('[social-card/stage]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Stage failed' },
      { status: 500 }
    );
  }
}
