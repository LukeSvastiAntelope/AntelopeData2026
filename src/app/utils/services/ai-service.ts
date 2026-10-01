/**
 * Anthropic-only AI gateway.
 *
 * Single chokepoint for every LLM call: model tiers, env overrides,
 * internal fallback, and usage metering (credits).
 *
 * No model id literals belong outside this file's tier config.
 */

import Anthropic from '@anthropic-ai/sdk';
import { getAiUsageContext } from '@/app/utils/services/ai-usage-context';
import {
  assertAiUsageAllowed,
  recordAiUsageEvent,
} from '@/app/utils/database/ai-usage-repo';
import { computeCredits } from '@/app/utils/services/ai-usage-config';

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
  usage?: AiUsageMeta;
  /** If true and stopReason is max_tokens, retry once with a larger budget. */
  expandOnTruncation?: boolean;
}

export interface AICompletionResponse {
  content: string;
  model: string;
  tier: ModelTier;
  usedFallback: boolean;
  /** Anthropic stop_reason (e.g. end_turn, max_tokens). */
  stopReason?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    credits?: number;
    costUsd?: number;
  };
  /** Soft-limit warning when org is near plan allowance. */
  usageWarning?: string | null;
}

export interface AIStreamingCompletionResponse {
  stream: ReadableStream<Uint8Array>;
  model: string;
  tier: ModelTier;
  usedFallback: boolean;
  /** Anthropic stop_reason (e.g. end_turn, max_tokens). Set when the stream finishes. */
  stopReason?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export type AiUsageMeta = {
  organizationId?: number | null;
  userId?: number | null;
  feature?: string;
};

export type AiCompleteParams = {
  tier?: ModelTier;
  messages: AIMessage[];
  system?: string;
  maxTokens?: number;
  temperature?: number;
  /** Optional metering attribution (merged with AsyncLocalStorage context). */
  usage?: AiUsageMeta;
  /** If true and stopReason is max_tokens, retry once with a larger budget. */
  expandOnTruncation?: boolean;
};

function resolveUsageMeta(explicit?: AiUsageMeta): AiUsageMeta {
  const ctx = getAiUsageContext();
  return {
    organizationId:
      explicit?.organizationId ?? ctx.organizationId ?? null,
    userId: explicit?.userId ?? ctx.userId ?? null,
    feature: explicit?.feature || ctx.feature || 'general',
  };
}

function meterInBackground(input: {
  meta: AiUsageMeta;
  tier: ModelTier;
  model: string;
  inputTokens: number;
  outputTokens: number;
  usedFallback: boolean;
}) {
  const { credits, costUsd } = computeCredits(
    input.model,
    input.inputTokens,
    input.outputTokens
  );
  const feature = String(input.meta.feature || 'general');
  const orgId =
    input.meta.organizationId != null && Number(input.meta.organizationId) > 0
      ? Number(input.meta.organizationId)
      : null;
  // Guardrail: user/campaign spend must be org-attributed. platform.* is
  // intentionally unbilled (Antelope own-growth, etc.).
  if (orgId == null && !feature.startsWith('platform.')) {
    console.warn('[ai-usage] unattributed', feature);
  }
  console.log(
    `[ai-gateway] metered org=${orgId ?? 'n/a'} feature=${feature} tier=${input.tier} model=${input.model} in=${input.inputTokens} out=${input.outputTokens} credits=${credits} usd=${costUsd}`
  );
  void recordAiUsageEvent({
    organizationId: orgId,
    userId: input.meta.userId,
    feature,
    tier: input.tier,
    model: input.model,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    usedFallback: input.usedFallback,
  });
}

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
  stopReason?: string;
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
    stopReason: completion.stop_reason
      ? String(completion.stop_reason)
      : undefined,
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
 * Meters tokens → credits and persists ai_usage_events (tenant-scoped).
 */
export async function aiComplete(
  params: AiCompleteParams
): Promise<AICompletionResponse> {
  const tier: ModelTier = params.tier || 'workhorse';
  const primaryModel = getModelForTier(tier);
  const messages = params.messages || [];
  const meta = resolveUsageMeta(params.usage);
  let maxTokens = params.maxTokens || 500;

  const gate = await assertAiUsageAllowed(meta.organizationId);
  const usageWarning = gate.warn
    ? `AI credits are at ${gate.summary?.percentUsed}% of this period's ${gate.summary?.planLabel} allowance (${gate.summary?.usedCredits} / ${gate.summary?.allowance}).`
    : null;

  const finish = (
    servedTier: ModelTier,
    model: string,
    usedFallback: boolean,
    result: {
      content: string;
      stopReason?: string;
      usage?: AICompletionResponse['usage'];
    }
  ): AICompletionResponse => {
    const promptTokens = result.usage?.promptTokens || 0;
    const completionTokens = result.usage?.completionTokens || 0;
    const { credits, costUsd } = computeCredits(
      model,
      promptTokens,
      completionTokens
    );
    meterInBackground({
      meta,
      tier: servedTier,
      model,
      inputTokens: promptTokens,
      outputTokens: completionTokens,
      usedFallback,
    });
    return {
      content: result.content,
      model,
      tier: servedTier,
      usedFallback,
      stopReason: result.stopReason,
      usage: result.usage
        ? { ...result.usage, credits, costUsd }
        : {
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens,
            credits,
            costUsd,
          },
      usageWarning,
    };
  };

  const runOnce = async (
    model: string,
    budget: number
  ): Promise<{
    content: string;
    stopReason?: string;
    usage?: AICompletionResponse['usage'];
  }> =>
    callAnthropicOnce({
      model,
      messages,
      system: params.system,
      maxTokens: budget,
    });

  const maybeExpand = async (
    model: string,
    result: {
      content: string;
      stopReason?: string;
      usage?: AICompletionResponse['usage'];
    }
  ) => {
    if (
      !params.expandOnTruncation ||
      result.stopReason !== 'max_tokens'
    ) {
      return result;
    }
    const expanded = Math.min(maxTokens * 2, 8000);
    if (expanded <= maxTokens) return result;
    console.warn(
      `[ai-gateway] truncated, retrying with larger budget (${maxTokens} → ${expanded})`
    );
    maxTokens = expanded;
    return runOnce(model, expanded);
  };

  try {
    let result = await runOnce(primaryModel, maxTokens);
    result = await maybeExpand(primaryModel, result);
    console.log(
      `[ai-gateway] served tier=${tier} model=${primaryModel} stop=${result.stopReason || 'n/a'}`
    );
    return finish(tier, primaryModel, false, result);
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
    let result = await runOnce(fallbackModel, maxTokens);
    result = await maybeExpand(fallbackModel, result);
    console.log(
      `[ai-gateway] served tier=${fallbackTier} model=${fallbackModel} (fallback from ${tier}) stop=${result.stopReason || 'n/a'}`
    );
    return finish(fallbackTier, fallbackModel, true, result);
  }
}

/**
 * Streaming variant — same tier + fallback + metering semantics.
 * Emits SSE: `data: {"type":"chunk","content":"..."}\n\n` then `data: [DONE]\n\n`.
 */
export async function aiCompleteStream(
  params: AiCompleteParams
): Promise<AIStreamingCompletionResponse> {
  const tier: ModelTier = params.tier || 'workhorse';
  let model = getModelForTier(tier);
  let usedFallback = false;
  let activeTier: ModelTier = tier;
  const meta = resolveUsageMeta(params.usage);

  await assertAiUsageAllowed(meta.organizationId);

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
  const servedModel = model;
  const servedTier = activeTier;
  const servedFallback = usedFallback;
  let inputTokens = 0;
  let outputTokens = 0;
  let streamedChars = 0;

  const response: AIStreamingCompletionResponse = {
    stream: undefined as unknown as ReadableStream<Uint8Array>,
    model: servedModel,
    tier: servedTier,
    usedFallback: servedFallback,
  };

  response.stream = new ReadableStream({
    async start(controller) {
      try {
        let stopReason: string | undefined;
        for await (const chunk of stream as any) {
          if (chunk.type === 'message_start' && chunk.message?.usage) {
            inputTokens = Number(chunk.message.usage.input_tokens) || 0;
          }
          if (chunk.type === 'message_delta') {
            if (chunk.usage) {
              outputTokens = Number(chunk.usage.output_tokens) || outputTokens;
            }
            if (chunk.delta?.stop_reason) {
              stopReason = String(chunk.delta.stop_reason);
            }
          }
          if (
            chunk.type === 'content_block_delta' &&
            chunk.delta?.type === 'text_delta'
          ) {
            const content = chunk.delta.text;
            if (content) {
              streamedChars += content.length;
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: 'chunk', content })}\n\n`
                )
              );
            }
          }
        }
        // Expose stop_reason to callers before the stream closes
        response.stopReason = stopReason;
        if (!outputTokens && streamedChars > 0) {
          outputTokens = Math.max(1, Math.ceil(streamedChars / 4));
        }
        meterInBackground({
          meta,
          tier: servedTier,
          model: servedModel,
          inputTokens,
          outputTokens,
          usedFallback: servedFallback,
        });
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });

  return response;
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
    usage: options.usage,
    expandOnTruncation: options.expandOnTruncation,
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
    usage: options.usage,
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
  usage?: AiUsageMeta;
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
    credits?: number;
    costUsd?: number;
  };
  usageWarning?: string | null;
}

export async function createCompletionWithTools(
  options: AICompletionWithToolsOptions
): Promise<AICompletionWithToolsResponse> {
  const tier = options.tier || resolveModelTier(options.model);
  const primaryModel = getModelForTier(tier);
  const meta = resolveUsageMeta(options.usage);
  const gate = await assertAiUsageAllowed(meta.organizationId);
  const usageWarning = gate.warn
    ? `AI credits are at ${gate.summary?.percentUsed}% of this period's ${gate.summary?.planLabel} allowance (${gate.summary?.usedCredits} / ${gate.summary?.allowance}).`
    : null;

  const finish = (
    servedTier: ModelTier,
    model: string,
    usedFallback: boolean,
    result: Omit<AICompletionWithToolsResponse, 'model' | 'tier' | 'usedFallback' | 'usageWarning'>
  ): AICompletionWithToolsResponse => {
    const promptTokens = result.usage?.promptTokens || 0;
    const completionTokens = result.usage?.completionTokens || 0;
    const { credits, costUsd } = computeCredits(
      model,
      promptTokens,
      completionTokens
    );
    meterInBackground({
      meta,
      tier: servedTier,
      model,
      inputTokens: promptTokens,
      outputTokens: completionTokens,
      usedFallback,
    });
    return {
      ...result,
      model,
      tier: servedTier,
      usedFallback,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        credits,
        costUsd,
      },
      usageWarning,
    };
  };

  try {
    const result = await createAnthropicCompletionWithTools({
      ...options,
      model: primaryModel,
    });
    console.log(`[ai-gateway] tools tier=${tier} model=${primaryModel}`);
    return finish(tier, primaryModel, false, result);
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
    return finish(fallbackTier, fallbackModel, true, result);
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
