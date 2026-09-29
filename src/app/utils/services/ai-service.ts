/**
 * Anthropic-only AI gateway.
 *
 * Single chokepoint for every LLM call: model tiers, env overrides,
 * internal fallback, and (later) usage metering.
 *
 * No model id literals belong outside this file's tier config.
 */

import Anthropic from '@anthropic-ai/sdk';

// ---------------------------------------------------------------------------
// Tiers
// ---------------------------------------------------------------------------

export type ModelTier = 'workhorse' | 'heavy' | 'cheap';

/** Defaults — override via ANTHROPIC_MODEL_WORKHORSE / _HEAVY / _CHEAP. */
export const DEFAULT_TIER_MODELS: Record<ModelTier, string> = {
  workhorse: 'claude-sonnet-5',
  heavy: 'claude-opus-5-5',
  cheap: 'claude-haiku-4-5-20251001',
};

/** Fallback tier when the primary errors (not_found / overloaded / 5xx). */
export const TIER_FALLBACK: Record<ModelTier, ModelTier | null> = {
  workhorse: 'cheap',
  heavy: 'workhorse',
  cheap: null,
};

export function getTierModels(): Record<ModelTier, string> {
  return {
    workhorse:
      process.env.ANTHROPIC_MODEL_WORKHORSE?.trim() ||
      DEFAULT_TIER_MODELS.workhorse,
    heavy:
      process.env.ANTHROPIC_MODEL_HEAVY?.trim() || DEFAULT_TIER_MODELS.heavy,
    cheap:
      process.env.ANTHROPIC_MODEL_CHEAP?.trim() || DEFAULT_TIER_MODELS.cheap,
  };
}

export function getModelForTier(tier: ModelTier): string {
  return getTierModels()[tier];
}

export function isModelTier(value: unknown): value is ModelTier {
  return value === 'workhorse' || value === 'heavy' || value === 'cheap';
}

/**
 * Map a legacy model id (or tier name) → tier.
 * Non-Anthropic ids are coerced to workhorse so remaining call sites
 * degrade onto Anthropic until they migrate to `tier:`.
 */
export function resolveModelTier(
  modelOrTier?: string | null
): ModelTier {
  const raw = String(modelOrTier || '').trim().toLowerCase();
  if (!raw) return 'workhorse';
  if (isModelTier(raw)) return raw;
  if (raw.includes('opus') || raw.includes('heavy')) return 'heavy';
  if (raw.includes('haiku') || raw.includes('cheap')) return 'cheap';
  if (raw.includes('sonnet') || raw.includes('claude')) return 'workhorse';
  // gpt-*, gemini-*, deepseek-*, etc. → workhorse bridge
  if (
    raw.startsWith('gpt-') ||
    raw.startsWith('o1') ||
    raw.startsWith('o3') ||
    raw.startsWith('o4') ||
    raw.startsWith('gemini-') ||
    raw.startsWith('deepseek-')
  ) {
    console.warn(
      `[ai-gateway] non-Anthropic model "${modelOrTier}" coerced to workhorse tier`
    );
    return 'workhorse';
  }
  return 'workhorse';
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AICompletionOptions {
  /** @deprecated Prefer `tier`. Resolved through the gateway if provided. */
  model?: string;
  tier?: ModelTier;
  messages: AIMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  frequencyPenalty?: number;
  presencePenalty?: number;
}

export interface AICompletionResponse {
  content: string;
  model: string;
  tier: ModelTier;
  usedFallback: boolean;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface AIStreamingCompletionResponse {
  stream: ReadableStream<Uint8Array>;
  model: string;
  tier: ModelTier;
  usedFallback: boolean;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export type AiCompleteParams = {
  tier?: ModelTier;
  messages: AIMessage[];
  system?: string;
  maxTokens?: number;
  temperature?: number;
};

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

let anthropic: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (!anthropic) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is not configured');
    }
    anthropic = new Anthropic({ apiKey });
  }
  return anthropic;
}

// ---------------------------------------------------------------------------
// Error classification / fallback
// ---------------------------------------------------------------------------

function isRetryableModelError(err: unknown): boolean {
  const e = err as {
    status?: number;
    statusCode?: number;
    message?: string;
    error?: { type?: string; message?: string };
  };
  const status = e?.status ?? e?.statusCode;
  const msg = `${e?.message || ''} ${e?.error?.message || ''} ${e?.error?.type || ''}`.toLowerCase();
  if (status === 404 || status === 529 || status === 503 || status === 500) {
    return true;
  }
  if (status === 429) return true;
  if (msg.includes('not_found')) return true;
  if (msg.includes('overloaded')) return true;
  if (msg.includes('model:')) return true;
  if (msg.includes('unavailable')) return true;
  return false;
}

function splitSystem(messages: AIMessage[], system?: string): {
  system?: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
} {
  const fromMessages = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .filter(Boolean);
  const systemText = [system, ...fromMessages].filter(Boolean).join('\n\n') || undefined;
  const anthMessages = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));
  // Anthropic requires first message to be user
  if (anthMessages.length && anthMessages[0].role !== 'user') {
    anthMessages.unshift({ role: 'user', content: 'Continue.' });
  }
  return { system: systemText, messages: anthMessages };
}

async function callAnthropicOnce(params: {
  model: string;
  messages: AIMessage[];
  system?: string;
  maxTokens?: number;
}): Promise<{
  content: string;
  usage?: AICompletionResponse['usage'];
}> {
  const client = getAnthropicClient();
  const split = splitSystem(params.messages, params.system);
  const requestParams: Record<string, unknown> = {
    model: params.model,
    max_tokens: params.maxTokens || 500,
    messages: split.messages,
  };
  if (split.system) requestParams.system = split.system;
  // Omit temperature — current Claude lineup rejects deprecated temperature.

  const completion = await client.messages.create(requestParams as any);
  const textContent = (completion.content || [])
    .filter((block: any) => block.type === 'text')
    .map((block: any) => block.text)
    .join('');

  return {
    content: textContent,
    usage: completion.usage
      ? {
          promptTokens: completion.usage.input_tokens,
          completionTokens: completion.usage.output_tokens,
          totalTokens:
            completion.usage.input_tokens + completion.usage.output_tokens,
        }
      : undefined,
  };
}

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

/**
 * Preferred entry: tiered Anthropic completion with one-shot internal fallback.
 */
export async function aiComplete(
  params: AiCompleteParams
): Promise<AICompletionResponse> {
  const tier: ModelTier = params.tier || 'workhorse';
  const primaryModel = getModelForTier(tier);
  const messages = params.messages || [];

  try {
    const result = await callAnthropicOnce({
      model: primaryModel,
      messages,
      system: params.system,
      maxTokens: params.maxTokens,
    });
    console.log(`[ai-gateway] served tier=${tier} model=${primaryModel}`);
    return {
      content: result.content,
      model: primaryModel,
      tier,
      usedFallback: false,
      usage: result.usage,
    };
  } catch (err) {
    const fallbackTier = TIER_FALLBACK[tier];
    if (!fallbackTier || !isRetryableModelError(err)) {
      throw err;
    }
    const fallbackModel = getModelForTier(fallbackTier);
    console.warn(
      `[ai-gateway] tier=${tier} model=${primaryModel} failed; falling back to tier=${fallbackTier} model=${fallbackModel}`,
      err instanceof Error ? err.message : err
    );
    const result = await callAnthropicOnce({
      model: fallbackModel,
      messages,
      system: params.system,
      maxTokens: params.maxTokens,
    });
    console.log(
      `[ai-gateway] served tier=${fallbackTier} model=${fallbackModel} (fallback from ${tier})`
    );
    return {
      content: result.content,
      model: fallbackModel,
      tier: fallbackTier,
      usedFallback: true,
      usage: result.usage,
    };
  }
}

/**
 * Streaming variant — same tier + fallback semantics.
 * Emits SSE: `data: {"type":"chunk","content":"..."}\n\n` then `data: [DONE]\n\n`.
 */
export async function aiCompleteStream(
  params: AiCompleteParams
): Promise<AIStreamingCompletionResponse> {
  const tier: ModelTier = params.tier || 'workhorse';
  let model = getModelForTier(tier);
  let usedFallback = false;
  let activeTier: ModelTier = tier;

  const client = getAnthropicClient();
  const split = splitSystem(params.messages || [], params.system);

  const startStream = async (modelId: string) => {
    const requestParams: Record<string, unknown> = {
      model: modelId,
      max_tokens: params.maxTokens || 500,
      messages: split.messages,
      stream: true,
    };
    if (split.system) requestParams.system = split.system;
    return client.messages.create(requestParams as any);
  };

  let stream: any;
  try {
    stream = await startStream(model);
    console.log(`[ai-gateway] stream tier=${tier} model=${model}`);
  } catch (err) {
    const fallbackTier = TIER_FALLBACK[tier];
    if (!fallbackTier || !isRetryableModelError(err)) throw err;
    activeTier = fallbackTier;
    model = getModelForTier(fallbackTier);
    usedFallback = true;
    console.warn(
      `[ai-gateway] stream tier=${tier} failed; falling back to tier=${fallbackTier} model=${model}`,
      err instanceof Error ? err.message : err
    );
    stream = await startStream(model);
  }

  const encoder = new TextEncoder();
  const readableStream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream as any) {
          if (
            chunk.type === 'content_block_delta' &&
            chunk.delta?.type === 'text_delta'
          ) {
            const content = chunk.delta.text;
            if (content) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: 'chunk', content })}\n\n`
                )
              );
            }
          }
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });

  return {
    stream: readableStream,
    model,
    tier: activeTier,
    usedFallback,
  };
}

// ---------------------------------------------------------------------------
// Backward-compatible wrappers (resolve model → tier → gateway)
// ---------------------------------------------------------------------------

export async function createCompletion(
  options: AICompletionOptions
): Promise<AICompletionResponse> {
  const tier =
    options.tier || resolveModelTier(options.model);
  return aiComplete({
    tier,
    messages: options.messages,
    maxTokens: options.maxTokens,
    temperature: options.temperature,
  });
}

export async function createStreamingCompletion(
  options: AICompletionOptions
): Promise<AIStreamingCompletionResponse> {
  const tier =
    options.tier || resolveModelTier(options.model);
  return aiCompleteStream({
    tier,
    messages: options.messages,
    maxTokens: options.maxTokens,
    temperature: options.temperature,
  });
}

// ---------------------------------------------------------------------------
// Tool-calling completions (consultant / shared agents) — Anthropic only
// ---------------------------------------------------------------------------

export type AIToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export type AIToolCall = {
  id: string;
  name: string;
  input: Record<string, unknown>;
};

export type AIToolResultMessage = {
  role: 'tool';
  toolCallId: string;
  content: string;
  isError?: boolean;
};

export type AIAssistantToolMessage = {
  role: 'assistant';
  content: string;
  toolCalls: AIToolCall[];
};

export type AIUserTextMessage = {
  role: 'user';
  content: string;
};

export type AISystemMessage = {
  role: 'system';
  content: string;
};

export type AIToolLoopMessage =
  | AISystemMessage
  | AIUserTextMessage
  | AIAssistantToolMessage
  | AIToolResultMessage
  | AIMessage;

export interface AICompletionWithToolsOptions {
  /** @deprecated Prefer `tier`. */
  model?: string;
  tier?: ModelTier;
  messages: AIToolLoopMessage[];
  tools: AIToolDefinition[];
  maxTokens?: number;
  toolChoice?: 'auto' | 'any' | 'none';
}

export interface AICompletionWithToolsResponse {
  content: string;
  toolCalls: AIToolCall[];
  stopReason: string;
  model: string;
  tier: ModelTier;
  usedFallback: boolean;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export async function createCompletionWithTools(
  options: AICompletionWithToolsOptions
): Promise<AICompletionWithToolsResponse> {
  const tier = options.tier || resolveModelTier(options.model);
  const primaryModel = getModelForTier(tier);

  try {
    const result = await createAnthropicCompletionWithTools({
      ...options,
      model: primaryModel,
    });
    console.log(`[ai-gateway] tools tier=${tier} model=${primaryModel}`);
    return {
      ...result,
      model: primaryModel,
      tier,
      usedFallback: false,
    };
  } catch (err) {
    const fallbackTier = TIER_FALLBACK[tier];
    if (!fallbackTier || !isRetryableModelError(err)) throw err;
    const fallbackModel = getModelForTier(fallbackTier);
    console.warn(
      `[ai-gateway] tools tier=${tier} failed; falling back to tier=${fallbackTier}`,
      err instanceof Error ? err.message : err
    );
    const result = await createAnthropicCompletionWithTools({
      ...options,
      model: fallbackModel,
    });
    return {
      ...result,
      model: fallbackModel,
      tier: fallbackTier,
      usedFallback: true,
    };
  }
}

async function createAnthropicCompletionWithTools(
  options: AICompletionWithToolsOptions & { model: string }
): Promise<Omit<AICompletionWithToolsResponse, 'model' | 'tier' | 'usedFallback'>> {
  const client = getAnthropicClient();

  const systemParts = options.messages
    .filter((m) => m.role === 'system')
    .map((m) =>
      typeof (m as AISystemMessage).content === 'string'
        ? (m as AISystemMessage).content
        : ''
    )
    .filter(Boolean);

  type AnthContent = any;
  const anthMessages: {
    role: 'user' | 'assistant';
    content: string | AnthContent[];
  }[] = [];

  for (const msg of options.messages) {
    if (msg.role === 'system') continue;

    if (msg.role === 'user') {
      anthMessages.push({
        role: 'user',
        content: (msg as AIUserTextMessage).content || '',
      });
      continue;
    }

    if (msg.role === 'assistant') {
      const assistant = msg as AIAssistantToolMessage | AIMessage;
      const blocks: AnthContent[] = [];
      const text = typeof assistant.content === 'string' ? assistant.content : '';
      if (text) blocks.push({ type: 'text', text });
      const calls = (assistant as AIAssistantToolMessage).toolCalls || [];
      for (const call of calls) {
        blocks.push({
          type: 'tool_use',
          id: call.id,
          name: call.name,
          input: call.input || {},
        });
      }
      anthMessages.push({
        role: 'assistant',
        content: blocks.length ? blocks : text || '(empty)',
      });
      continue;
    }

    if (msg.role === 'tool') {
      const toolMsg = msg as AIToolResultMessage;
      const last = anthMessages[anthMessages.length - 1];
      const resultBlock = {
        type: 'tool_result',
        tool_use_id: toolMsg.toolCallId,
        content: toolMsg.content,
        is_error: toolMsg.isError || false,
      };
      if (last && last.role === 'user' && Array.isArray(last.content)) {
        (last.content as AnthContent[]).push(resultBlock);
      } else {
        anthMessages.push({ role: 'user', content: [resultBlock] });
      }
    }
  }

  if (anthMessages.length && anthMessages[0].role !== 'user') {
    anthMessages.unshift({ role: 'user', content: 'Continue.' });
  }

  const tools = (options.tools || []).map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: {
      type: 'object',
      ...(t.inputSchema || { properties: {} }),
    },
  }));

  const requestParams: any = {
    model: options.model,
    max_tokens: options.maxTokens || 2000,
    messages: anthMessages,
    tools,
    tool_choice: { type: options.toolChoice || 'auto' },
  };
  if (systemParts.length) {
    requestParams.system = systemParts.join('\n\n');
  }

  const completion = await client.messages.create(requestParams);
  const contentBlocks = completion.content || [];
  const textContent = contentBlocks
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('');
  const toolCalls: AIToolCall[] = contentBlocks
    .filter((b: any) => b.type === 'tool_use')
    .map((b: any) => ({
      id: String(b.id),
      name: String(b.name),
      input: (b.input && typeof b.input === 'object'
        ? b.input
        : {}) as Record<string, unknown>,
    }));

  return {
    content: textContent,
    toolCalls,
    stopReason: String(
      completion.stop_reason || (toolCalls.length ? 'tool_use' : 'end_turn')
    ),
    usage: completion.usage
      ? {
          promptTokens: completion.usage.input_tokens,
          completionTokens: completion.usage.output_tokens,
          totalTokens:
            completion.usage.input_tokens + completion.usage.output_tokens,
        }
      : undefined,
  };
}
