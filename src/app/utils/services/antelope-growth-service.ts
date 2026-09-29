/**
 * Admin A5 — Antelope own-growth marketing: agentic draft → approval gate.
 * Never auto-posts. Separate from every candidate's outbound.
 */

import { createCompletion } from '@/app/utils/services/ai-service';
import {
  AntelopeGrowthRepo,
  type GrowthChannel,
  type MarketingDraft,
  type MarketingDraftSource,
} from '@/app/utils/database/antelope-growth-repo';
import { ConsultantRepo } from '@/app/utils/database/consultant-repo';
import { executeTool } from '@/app/utils/services/tools/executor';

const FALLBACK_COPY: Array<{ topic: string; body: string }> = [
  {
    topic: 'listen-analyze-act',
    body: 'Campaigns deserve a closed loop: listen to the district, analyze what moves whom, then act — and listen again. That\'s the whole product. antelopedata.org',
  },
  {
    topic: 'downballot tools',
    body: 'Most political software is priced for races that already have staff. Antelope is built for the ones that don\'t — school board, city council, county. Same loop. Honest pricing.',
  },
  {
    topic: 'transparent pricing',
    body: 'If the price isn\'t on the page, it isn\'t the price. Ours is public — Hyperlocal through Federal — so a first-time candidate can decide without a sales call.',
  },
  {
    topic: 'district intelligence',
    body: 'A district isn\'t a vibe. It\'s neighborhoods, cohorts, and shifting priorities. Antelope helps you ask, map, and remember — so you\'re not governing blind.',
  },
];

function stripQuotes(s: string): string {
  return s
    .trim()
    .replace(/^["'“”]+/, '')
    .replace(/["'“”]+$/, '')
    .trim();
}

export async function getOrCreateGrowthChannel(): Promise<GrowthChannel> {
  return AntelopeGrowthRepo.ensureTwitterChannel();
}

/**
 * Generate one X/Twitter draft for Antelope's own account.
 * Uses Claude/OpenAI when keyed; otherwise curated fallback copy.
 */
export async function generateAntelopeMarketingCopy(input?: {
  topic?: string | null;
  tone?: string | null;
}): Promise<{ body: string; topic: string; tone: string; via: 'ai' | 'fallback' }> {
  const channel = await getOrCreateGrowthChannel();
  const settings = channel.settings || {};
  const topics = Array.isArray(settings.topics)
    ? (settings.topics as string[]).map(String)
    : FALLBACK_COPY.map((f) => f.topic);
  const topic =
    (input?.topic && String(input.topic).trim()) ||
    topics[Math.floor(Math.random() * topics.length)] ||
    'Antelope product';
  const tone =
    (input?.tone && String(input.tone).trim()) ||
    String(settings.tone || 'plainspoken civic-tech');

  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY);

  if (hasKey) {
    try {
      const res = await createCompletion({
        tier: 'workhorse',
        temperature: 0.7,
        maxTokens: 280,
        messages: [
          {
            role: 'system',
            content: [
              'You write short Twitter/X posts for Antelope (antelopedata.org), a civic-tech survey + analytics platform for downballot campaigns.',
              'Rules: one post only; max 260 characters; no hashtag spam (at most 1); no emojis; no invented endorsements, poll numbers, or candidate claims;',
              'never speak as a candidate campaign — this is Antelope the company;',
              'plainspoken, confident, specific; end without a hard sell.',
            ].join(' '),
          },
          {
            role: 'user',
            content: `Topic: ${topic}\nTone: ${tone}\nWrite the post body only.`,
          },
        ],
      });
      const body = stripQuotes(res.content || '').slice(0, 280);
      if (body.length >= 40) {
        return { body, topic, tone, via: 'ai' };
      }
    } catch (err) {
      console.warn('[antelope-growth] AI draft failed, using fallback', err);
    }
  }

  const pick =
    FALLBACK_COPY.find((f) =>
      f.topic.toLowerCase().includes(topic.toLowerCase().slice(0, 12))
    ) || FALLBACK_COPY[Math.floor(Math.random() * FALLBACK_COPY.length)]!;
  return {
    body: pick.body.slice(0, 280),
    topic: topic || pick.topic,
    tone,
    via: 'fallback',
  };
}

/**
 * Stage a draft at the human approval gate (same language as Auto-Post).
 * Creates antelope_marketing_drafts row + consultant_staged_actions card.
 * NEVER posts to X.
 */
export async function stageAntelopeMarketingDraft(params: {
  actorUserId: number;
  body?: string | null;
  topic?: string | null;
  tone?: string | null;
  source?: MarketingDraftSource;
  generate?: boolean;
}): Promise<{
  draft: MarketingDraft;
  stagedActionId: number | null;
  generatedVia?: 'ai' | 'fallback';
}> {
  const channel = await getOrCreateGrowthChannel();
  if (channel.status === 'revoked' || channel.status === 'paused') {
    throw new Error(
      `Growth channel is ${channel.status} — enable it before drafting`
    );
  }

  let body = params.body ? String(params.body).trim() : '';
  let topic = params.topic ? String(params.topic) : null;
  let tone = params.tone ? String(params.tone) : null;
  let generatedVia: 'ai' | 'fallback' | undefined;

  if (!body || params.generate) {
    const gen = await generateAntelopeMarketingCopy({ topic, tone });
    body = gen.body;
    topic = topic || gen.topic;
    tone = tone || gen.tone;
    generatedVia = gen.via;
  }

  // Registry tool path — risk=approval so executeTool always holds
  const toolResult = await executeTool(
    {
      name: 'post_antelope_marketing',
      input: {
        body,
        topic: topic || undefined,
        channel: 'twitter',
        handle: channel.handle,
      },
    },
    {
      userId: params.actorUserId,
      organizationId: 0, // platform-owned — not a candidate org
    }
  );

  const draft = await AntelopeGrowthRepo.createDraft({
    channelId: channel.id,
    body,
    topic,
    tone,
    source: params.source || (params.generate || !params.body ? 'agent' : 'manual'),
    status: 'pending_approval',
    metadata: {
      kind: 'antelope_growth',
      generatedVia: generatedVia || null,
      handle: channel.handle,
      heldAtGate: true,
      neverAutoPost: true,
    },
    createdBy: params.actorUserId,
  });

  let stagedActionId: number | null = null;
  if (toolResult.ok && toolResult.status === 'pending_approval') {
    // Platform conversation (org 0) so approval cards reuse the same gate UX
    const conversation = await ConsultantRepo.getOrCreateConversation({
      userId: params.actorUserId,
      organizationId: 0,
    });
    const summary = [
      '### Antelope marketing draft — review before it goes out',
      `- Channel: **@${channel.handle}** (Twitter/X)`,
      topic ? `- Topic: ${topic}` : null,
      '',
      body,
      '',
      '_Antelope own-growth only — not a candidate send. Nothing posts until you Approve, and Approve does not auto-tweet._',
    ]
      .filter(Boolean)
      .join('\n');

    const staged = await ConsultantRepo.createStagedAction({
      conversationId: conversation.id,
      toolName: 'post_antelope_marketing',
      summary,
      payload: {
        kind: 'antelope_marketing',
        reviewOnly: true, // Approve marks reviewed — never executes a live post
        tool: 'post_antelope_marketing',
        marketingDraftId: draft.id,
        input: {
          body,
          topic,
          channel: 'twitter',
          handle: channel.handle,
        },
        description: 'Antelope own-growth X draft',
      },
    });
    stagedActionId = staged.id;
    await AntelopeGrowthRepo.setStagedActionId(draft.id, staged.id);

    const messages = [
      ...conversation.messages,
      {
        role: 'assistant' as const,
        content: summary,
        meta: {
          kind: 'staged_notice' as const,
          toolName: 'post_antelope_marketing',
          risk: 'approval' as const,
          stagedActionId: staged.id,
        },
        createdAt: new Date().toISOString(),
      },
    ];
    await ConsultantRepo.saveMessages(
      conversation.id,
      params.actorUserId,
      messages
    );
  }

  const refreshed = (await AntelopeGrowthRepo.getDraft(draft.id)) || draft;
  return { draft: refreshed, stagedActionId, generatedVia };
}

export async function approveMarketingDraft(
  draftId: number,
  actorUserId: number
): Promise<MarketingDraft> {
  const updated = await AntelopeGrowthRepo.approve(draftId, actorUserId);
  if (!updated) {
    throw new Error('Draft not found or not pending approval');
  }
  // Mirror consultant staged card if linked
  if (updated.stagedActionId) {
    await ConsultantRepo.updateStagedAction(updated.stagedActionId, {
      status: 'approved',
      resultSummary:
        'Approved for Antelope growth. No tweet was sent — mark posted only after you publish manually (or wire X API in a follow-on).',
      resultData: {
        reviewOnly: true,
        marketingDraftId: updated.id,
        neverAutoPost: true,
      },
    });
  }
  return updated;
}

export async function rejectMarketingDraft(
  draftId: number,
  actorUserId: number
): Promise<MarketingDraft> {
  const updated = await AntelopeGrowthRepo.reject(draftId, actorUserId);
  if (!updated) {
    throw new Error('Draft not found or not pending approval');
  }
  if (updated.stagedActionId) {
    await ConsultantRepo.updateStagedAction(updated.stagedActionId, {
      status: 'dismissed',
      resultSummary: 'Rejected — will not post.',
      resultData: { marketingDraftId: updated.id },
    });
  }
  return updated;
}

/**
 * Scheduler entry: create at most one pending draft when auto-draft is enabled.
 * Never posts.
 */
export async function runScheduledMarketingDraft(actorUserId: number): Promise<{
  created: boolean;
  draft: MarketingDraft | null;
  reason?: string;
}> {
  const channel = await getOrCreateGrowthChannel();
  const settings = channel.settings || {};
  if (settings.autoDraftEnabled === false) {
    return { created: false, draft: null, reason: 'autoDraftEnabled=false' };
  }
  if (channel.status !== 'connected') {
    return {
      created: false,
      draft: null,
      reason: `channel status=${channel.status}`,
    };
  }
  const pending = await AntelopeGrowthRepo.countPending();
  if (pending >= 5) {
    return {
      created: false,
      draft: null,
      reason: 'pending_approval backlog ≥ 5',
    };
  }
  const { draft } = await stageAntelopeMarketingDraft({
    actorUserId,
    generate: true,
    source: 'scheduler',
  });
  return { created: true, draft };
}
