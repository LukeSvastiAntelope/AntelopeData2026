import {
  createCompletionWithTools,
  type AIToolLoopMessage,
  type AIToolDefinition,
} from '@/app/utils/services/ai-service';
import {
  executeTool,
  listToolDescriptorsForModel,
  type ToolExecutionResult,
} from '@/app/utils/services/tools';
import {
  ConsultantRepo,
  type ConsultantConversation,
  type ConsultantStagedAction,
  type ConsultantStoredMessage,
} from '@/app/utils/database/consultant-repo';

const CONSULTANT_MODEL =
  process.env.ANTHROPIC_API_KEY
    ? 'claude-sonnet-4-6'
    : process.env.OPENAI_API_KEY
      ? 'gpt-4o'
      : 'claude-sonnet-4-6';

const MAX_TOOL_ROUNDS = 6;

const SYSTEM_PROMPT = `You are Antelope's Campaign Consultant — an intake specialist for hyperlocal and downballot races.

Your job is NOT to give generic campaign advice. Every turn you must either:
1. Produce a concrete artifact/result by calling a tool (survey draft, district data, analytics, etc.), OR
2. Ask one specific question that unblocks the next artifact.

Intake style:
- First learn what office they are running for and where (city/district/state).
- Then request the documents or voter files you need — do not pretend you already have them.
- Prefer tools over prose. When you can draft, fetch, or analyze, call the tool.

Analytics → socials chain (when they have survey data and want content):
1. run_analytics
2. find_postable_insight (hard statistical gate in code — you do not invent significance)
3. Human picks a candidate
4. draft_posts (auto) and/or generate_and_post_video (approval — staged until human confirms)

Honesty:
- If a tool returns implemented:false / "Not implemented", say so plainly. Never simulate competence or invent results.
- Never invent poll numbers, endorsements, or list sizes.
- If find_postable_insight says nothing cleared the gate, say so plainly — do not confabulate a postable finding.
- You cannot override tool risk. Approval-gated tools (publish, SMS, email, webhooks, charges, video post) will be staged for the human — tell them a review card will appear; do not claim the action already ran.

Scope readiness:
- You can safely own Plan, Know, Ask, and Understand today.
- Spread (webhook distribute) and Act/outbound are incomplete — if asked, say so and stage only what exists.

Response style:
- Short markdown. Lead with the artifact or the single question.
- No filler strategy essays. No "here are some tips" lists unless tied to a just-produced artifact.`;

export type ConsultantTurnAutoResult = {
  toolName: string;
  summary: string;
  data?: Record<string, unknown>;
  implemented?: boolean;
};

export type ConsultantTurnResult = {
  conversationId: number;
  reply: string;
  messages: ConsultantStoredMessage[];
  autoResults: ConsultantTurnAutoResult[];
  stagedActions: ConsultantStagedAction[];
  modelUsed: string;
  offline?: boolean;
};

function descriptorsToAITools(): AIToolDefinition[] {
  return listToolDescriptorsForModel().map((d) => ({
    name: d.name,
    description: d.description,
    inputSchema: d.inputSchema as Record<string, unknown>,
  }));
}

function toLoopMessages(history: ConsultantStoredMessage[]): AIToolLoopMessage[] {
  // Only user/assistant text for model context (tool meta already folded into assistant text)
  const out: AIToolLoopMessage[] = [];
  for (const m of history) {
    if (m.role === 'user') {
      out.push({ role: 'user', content: m.content });
    } else if (m.role === 'assistant') {
      out.push({ role: 'assistant', content: m.content });
    }
  }
  return out;
}

function formatToolResultForModel(result: ToolExecutionResult): string {
  if (result.status === 'pending_approval') {
    return JSON.stringify({
      status: 'pending_approval',
      tool: result.tool,
      message:
        'Action staged for human approval. Do NOT claim it executed. Tell the user to review the approval card.',
      summary: result.summary,
    });
  }
  if (result.ok === false) {
    return JSON.stringify({
      status: result.status,
      error: result.summary,
      errorCode: result.errorCode,
    });
  }
  return JSON.stringify({
    status: result.status,
    tool: result.tool,
    summary: result.summary,
    data: result.data ?? null,
  });
}

function offlineIntakeReply(userMessage: string): string {
  const lower = userMessage.toLowerCase();
  if (!/\b(for|running|office|council|board|mayor|house|senate|district)\b/.test(lower)) {
    return [
      "I'm ready to work as your intake consultant, but no AI provider key is configured here yet.",
      '',
      '**What office are you running for**, and in which city / district / state?',
      '',
      'Once a key is connected I can draft surveys, pull district data, and run private analytics — high-risk sends stay behind Approve.',
    ].join('\n');
  }
  return [
    'Noted. Without an AI key I cannot call tools yet.',
    '',
    '**Next concrete ask:** upload or point me at your voter file (Voter Files), or paste the top 2–3 issues you want a baseline survey to measure.',
    '',
    'I will not invent drafts until tools are available.',
  ].join('\n');
}

/**
 * Run one consultant turn: append user message, tool-use loop, persist, return UI payload.
 * Stateless-per-turn from the API's perspective — history lives in consultant_conversations.
 */
export async function runConsultantMessage(params: {
  userId: number;
  organizationId?: number | null;
  message: string;
  conversationId?: number;
}): Promise<ConsultantTurnResult> {
  const text = String(params.message || '').trim();
  if (!text) throw new Error('Message required');

  let conversation: ConsultantConversation;
  if (params.conversationId) {
    const existing = await ConsultantRepo.getConversationById(
      params.conversationId,
      params.userId
    );
    if (!existing) throw new Error('Conversation not found');
    conversation = existing;
  } else {
    conversation = await ConsultantRepo.getOrCreateConversation({
      userId: params.userId,
      organizationId: params.organizationId,
    });
  }

  const messages: ConsultantStoredMessage[] = [
    ...conversation.messages,
    {
      role: 'user',
      content: text,
      meta: { kind: 'text' },
      createdAt: new Date().toISOString(),
    },
  ];

  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY);
  if (!hasKey) {
    const reply = offlineIntakeReply(text);
    messages.push({
      role: 'assistant',
      content: reply,
      meta: { kind: 'text' },
      createdAt: new Date().toISOString(),
    });
    await ConsultantRepo.saveMessages(conversation.id, params.userId, messages);
    const stagedActions = await ConsultantRepo.listStagedActions(conversation.id, 'pending');
    return {
      conversationId: conversation.id,
      reply,
      messages,
      autoResults: [],
      stagedActions,
      modelUsed: 'offline-fallback',
      offline: true,
    };
  }

  const autoResults: ConsultantTurnAutoResult[] = [];
  const newlyStaged: ConsultantStagedAction[] = [];
  const model = CONSULTANT_MODEL;
  const tools = descriptorsToAITools();

  const loopMessages: AIToolLoopMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...toLoopMessages(messages),
  ];

  let finalReply = '';

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const completion = await createCompletionWithTools({
        model,
        messages: loopMessages,
        tools,
        maxTokens: 2000,
        toolChoice: 'auto',
      });

      if (!completion.toolCalls.length) {
        finalReply = (completion.content || '').trim();
        break;
      }

      // Record assistant tool-call turn for the provider loop
      loopMessages.push({
        role: 'assistant',
        content: completion.content || '',
        toolCalls: completion.toolCalls,
      });

      for (const call of completion.toolCalls) {
        const result = await executeTool(
          { name: call.name, input: call.input },
          {
            userId: params.userId,
            organizationId: params.organizationId,
          }
        );

        if (result.status === 'pending_approval' && result.ok) {
          const staged = await ConsultantRepo.createStagedAction({
            conversationId: conversation.id,
            toolName: result.tool,
            summary: result.summary,
            payload: {
              tool: result.tool,
              input: result.staged.input,
              description: result.staged.description,
            },
          });
          newlyStaged.push(staged);

          messages.push({
            role: 'assistant',
            content: `Staged for your review: **${result.tool}** — approve or dismiss in the card below.`,
            meta: {
              kind: 'staged_notice',
              toolName: result.tool,
              risk: 'approval',
              stagedActionId: staged.id,
            },
            createdAt: new Date().toISOString(),
          });

          loopMessages.push({
            role: 'tool',
            toolCallId: call.id,
            content: formatToolResultForModel(result),
          });
          continue;
        }

        if (result.ok && result.status === 'executed') {
          const implemented =
            result.data && typeof result.data.implemented === 'boolean'
              ? Boolean(result.data.implemented)
              : undefined;
          autoResults.push({
            toolName: result.tool,
            summary: result.summary,
            data: result.data,
            implemented,
          });
          messages.push({
            role: 'assistant',
            content: result.summary,
            meta: {
              kind: 'tool_result',
              toolName: result.tool,
              risk: result.risk,
              implemented,
            },
            createdAt: new Date().toISOString(),
          });
        }

        loopMessages.push({
          role: 'tool',
          toolCallId: call.id,
          content: formatToolResultForModel(result),
          isError: !result.ok,
        });
      }
    }

    // If we exited after tools without a closing text turn, ask the model once more with tools disabled
    if (!finalReply) {
      const closing = await createCompletionWithTools({
        model,
        messages: loopMessages,
        tools,
        maxTokens: 1200,
        toolChoice: 'none',
      });
      finalReply = (closing.content || '').trim();
    }
  } catch (error) {
    console.error('Consultant agent error:', error);
    finalReply = [
      'I hit a provider error mid-turn.',
      '',
      '**Specific question:** what office and district are you running in? I will retry tools on your next message.',
      '',
      error instanceof Error ? `_Technical: ${error.message}_` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  if (!finalReply) {
    finalReply = newlyStaged.length
      ? 'I staged an action for your approval. Review the card below — nothing leaves until you Approve.'
      : autoResults.length
        ? 'Artifact above. **What should we do with this next** — save it, refine it, or pull related district data?'
        : '**What office are you running for**, and where?';
  }

  messages.push({
    role: 'assistant',
    content: finalReply,
    meta: { kind: 'text' },
    createdAt: new Date().toISOString(),
  });

  await ConsultantRepo.saveMessages(conversation.id, params.userId, messages);

  const pending = await ConsultantRepo.listStagedActions(conversation.id, 'pending');

  return {
    conversationId: conversation.id,
    reply: finalReply,
    messages,
    autoResults,
    stagedActions: pending,
    modelUsed: model,
    offline: false,
  };
}

/**
 * Approve a staged action: run executeApprovedTool, mark executed, append result to conversation.
 */
export async function approveStagedAction(params: {
  userId: number;
  stagedActionId: number;
}): Promise<{
  staged: ConsultantStagedAction;
  conversation: ConsultantConversation;
  execution: ToolExecutionResult;
}> {
  const staged = await ConsultantRepo.getStagedActionById(params.stagedActionId);
  if (!staged) throw new Error('Staged action not found');
  if (staged.status !== 'pending') {
    throw new Error(`Staged action is ${staged.status}, not pending`);
  }

  const conversation = await ConsultantRepo.assertConversationOwner(
    staged.conversationId,
    params.userId
  );
  if (!conversation) throw new Error('Unauthorized');

  const toolName = String(staged.payload.tool || staged.toolName);
  const input = (staged.payload.input || {}) as Record<string, unknown>;

  const { executeApprovedTool } = await import('@/app/utils/services/tools');
  const execution = await executeApprovedTool(
    { name: toolName, input },
    { userId: params.userId, organizationId: conversation.organizationId }
  );

  const updated = await ConsultantRepo.updateStagedAction(staged.id, {
    status: execution.ok && execution.status === 'executed' ? 'executed' : 'approved',
    resultSummary: execution.summary,
    resultData: execution.ok && 'data' in execution ? execution.data || null : null,
  });

  const messages = [
    ...conversation.messages,
    {
      role: 'assistant' as const,
      content: execution.summary,
      meta: {
        kind: 'tool_result' as const,
        toolName,
        risk: 'approval' as const,
        stagedActionId: staged.id,
        implemented:
          execution.ok && execution.status === 'executed' && execution.data
            ? (execution.data.implemented as boolean | undefined)
            : undefined,
      },
      createdAt: new Date().toISOString(),
    },
  ];
  await ConsultantRepo.saveMessages(conversation.id, params.userId, messages);

  const refreshed = await ConsultantRepo.getConversationById(conversation.id, params.userId);
  return {
    staged: updated!,
    conversation: refreshed!,
    execution,
  };
}

export async function dismissStagedAction(params: {
  userId: number;
  stagedActionId: number;
}): Promise<ConsultantStagedAction> {
  const staged = await ConsultantRepo.getStagedActionById(params.stagedActionId);
  if (!staged) throw new Error('Staged action not found');
  if (staged.status !== 'pending') {
    throw new Error(`Staged action is ${staged.status}, not pending`);
  }
  const conversation = await ConsultantRepo.assertConversationOwner(
    staged.conversationId,
    params.userId
  );
  if (!conversation) throw new Error('Unauthorized');

  const updated = await ConsultantRepo.updateStagedAction(staged.id, {
    status: 'dismissed',
  });

  const messages = [
    ...conversation.messages,
    {
      role: 'assistant' as const,
      content: `Dismissed staged action **${staged.toolName}**. Nothing was sent or published.`,
      meta: {
        kind: 'staged_notice' as const,
        toolName: staged.toolName,
        risk: 'approval' as const,
        stagedActionId: staged.id,
      },
      createdAt: new Date().toISOString(),
    },
  ];
  await ConsultantRepo.saveMessages(conversation.id, params.userId, messages);

  return updated!;
}

export async function getConsultantConversationState(params: {
  userId: number;
  organizationId?: number | null;
}): Promise<{
  conversation: ConsultantConversation;
  stagedActions: ConsultantStagedAction[];
}> {
  const conversation = await ConsultantRepo.getOrCreateConversation({
    userId: params.userId,
    organizationId: params.organizationId,
  });
  const stagedActions = await ConsultantRepo.listStagedActions(conversation.id, 'pending');
  return { conversation, stagedActions };
}
