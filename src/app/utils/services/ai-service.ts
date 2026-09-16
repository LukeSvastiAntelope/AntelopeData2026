import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AICompletionOptions {
  model: string;
  messages: AIMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  frequencyPenalty?: number;
  presencePenalty?: number;
}

export interface AICompletionResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface AIStreamingCompletionResponse {
  stream: ReadableStream<Uint8Array>;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// Initialize AI clients - only on server side
let openai: OpenAI | null = null;
let deepseek: OpenAI | null = null;
let gemini: OpenAI | null = null;
let anthropic: Anthropic | null = null;

function getOpenAIClient() {
  if (!openai) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openai;
}

function getDeepSeekClient() {
  if (!deepseek) {
    deepseek = new OpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseURL: 'https://api.deepseek.com/v1'
    });
  }
  return deepseek;
}

function getGeminiClient() {
  if (!gemini) {
    gemini = new OpenAI({
      apiKey: process.env.GEMINI_API_KEY,
      baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/'
    });
  }
  return gemini;
}

function getAnthropicClient() {
  if (!anthropic) {
    anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });
  }
  return anthropic;
}

// Determine provider from model ID
function getProvider(modelId: string): 'openai' | 'deepseek' | 'gemini' | 'anthropic' {
  if (
    modelId.startsWith('gpt-') ||
    modelId.startsWith('o1') ||
    modelId.startsWith('o3') ||
    modelId.startsWith('o4')
  ) return 'openai';
  if (modelId.startsWith('deepseek-')) return 'deepseek';
  if (modelId.startsWith('gemini-')) return 'gemini';
  if (modelId.startsWith('claude-')) return 'anthropic';
  return 'openai'; // default fallback
}

// Main completion function that routes to appropriate provider
export async function createCompletion(options: AICompletionOptions): Promise<AICompletionResponse> {
  const provider = getProvider(options.model);
  
  switch (provider) {
    case 'openai':
      return createOpenAICompletion(options);
    case 'deepseek':
      return createDeepSeekCompletion(options);
    case 'gemini':
      return createGeminiCompletion(options);
    case 'anthropic':
      return createAnthropicCompletion(options);
    default:
      throw new Error(`Unsupported provider for model: ${options.model}`);
  }
}

// Streaming completion function
export async function createStreamingCompletion(options: AICompletionOptions): Promise<AIStreamingCompletionResponse> {
  const provider = getProvider(options.model);
  
  switch (provider) {
    case 'openai':
      return createOpenAIStreamingCompletion(options);
    case 'deepseek':
      return createDeepSeekStreamingCompletion(options);
    case 'gemini':
      return createGeminiStreamingCompletion(options);
    case 'anthropic':
      return createAnthropicStreamingCompletion(options);
    default:
      throw new Error(`Unsupported provider for model: ${options.model}`);
  }
}

// OpenAI completion
async function createOpenAICompletion(options: AICompletionOptions): Promise<AICompletionResponse> {
  const client = getOpenAIClient();
  
  // Determine if this is a newer model that uses max_completion_tokens
  // All o-series, gpt-4.1+, gpt-4o, and gpt-5+ models use this parameter
  const usesCompletionTokens =
    options.model.startsWith('o1') ||
    options.model.startsWith('o3') ||
    options.model.startsWith('o4') ||
    options.model.startsWith('gpt-5') ||
    options.model.startsWith('gpt-4.1') ||
    options.model.includes('gpt-4o');
  
  const requestParams: any = {
    model: options.model,
    messages: options.messages.map(msg => ({
      role: msg.role,
      content: msg.content
    })),
    stream: false,
  };

  // Add parameters based on model type
  if (usesCompletionTokens) {
    // Newer models (o1, o3) use max_completion_tokens and don't support some parameters
    // These models need more tokens because they use many for internal reasoning
    requestParams.max_completion_tokens = options.maxTokens ? Math.max(options.maxTokens, 2000) : 2000;
  } else {
    // Older models use max_tokens and support all parameters
    requestParams.temperature = options.temperature !== undefined ? options.temperature : 0.25;
    requestParams.max_tokens = options.maxTokens || 500;
    requestParams.frequency_penalty = options.frequencyPenalty || 0.2;
    requestParams.presence_penalty = options.presencePenalty || 0.2;
  }

  console.log(`Making request to ${options.model} with params:`, requestParams);
  
  const completion = await client.chat.completions.create(requestParams);
  
  console.log(`Response from ${options.model}:`, {
    choices: completion.choices,
    usage: completion.usage,
    content: completion.choices[0]?.message?.content
  });

  const content = completion.choices[0]?.message?.content;
  
  if (!content) {
    console.warn(`Empty content returned from ${options.model}`);
  }

  return {
    content: content || '',
    usage: completion.usage ? {
      promptTokens: completion.usage.prompt_tokens,
      completionTokens: completion.usage.completion_tokens,
      totalTokens: completion.usage.total_tokens,
    } : undefined
  };
}

// DeepSeek completion (uses OpenAI-compatible API)
async function createDeepSeekCompletion(options: AICompletionOptions): Promise<AICompletionResponse> {
  const client = getDeepSeekClient();
  const completion = await client.chat.completions.create({
    model: options.model,
    messages: options.messages.map(msg => ({
      role: msg.role,
      content: msg.content
    })),
    temperature: options.temperature !== undefined ? options.temperature : 0.25,
    max_tokens: options.maxTokens || 500,
    stream: false,
  });

  return {
    content: completion.choices[0].message.content || '',
    usage: completion.usage ? {
      promptTokens: completion.usage.prompt_tokens,
      completionTokens: completion.usage.completion_tokens,
      totalTokens: completion.usage.total_tokens,
    } : undefined
  };
}

// Gemini completion (uses OpenAI-compatible API)
async function createGeminiCompletion(options: AICompletionOptions): Promise<AICompletionResponse> {
  const client = getGeminiClient();
  const completion = await client.chat.completions.create({
    model: options.model,
    messages: options.messages.map(msg => ({
      role: msg.role,
      content: msg.content
    })),
    temperature: options.temperature !== undefined ? options.temperature : 0.25,
    max_tokens: options.maxTokens || 500,
    stream: false,
  });

  return {
    content: completion.choices[0].message.content || '',
    usage: completion.usage ? {
      promptTokens: completion.usage.prompt_tokens,
      completionTokens: completion.usage.completion_tokens,
      totalTokens: completion.usage.total_tokens,
    } : undefined
  };
}

// Anthropic Claude completion (uses native Anthropic API)
async function createAnthropicCompletion(options: AICompletionOptions): Promise<AICompletionResponse> {
  const client = getAnthropicClient();
  
  // Convert messages to Anthropic format
  const messages = options.messages.filter(msg => msg.role !== 'system').map(msg => ({
    role: msg.role as 'user' | 'assistant',
    content: msg.content
  }));
  
  // Extract system message if present
  const systemMessage = options.messages.find(msg => msg.role === 'system');
  
  const requestParams: any = {
    model: options.model,
    max_tokens: options.maxTokens || 500,
    messages: messages,
  };
  
  if (systemMessage) {
    requestParams.system = systemMessage.content;
  }

  // Omit `temperature` — the current Claude model lineup (Opus/Sonnet/Haiku)
  // rejects it ("temperature is deprecated for this model"); defaults are fine.

  console.log(`Making request to ${options.model} with params:`, requestParams);

  const completion = await client.messages.create(requestParams);
  
  console.log(`Response from ${options.model}:`, {
    content: completion.content,
    usage: completion.usage
  });

  // Extract text content from Claude's response
  const textContent = completion.content
    .filter((block: any) => block.type === 'text')
    .map((block: any) => block.text)
    .join('');

  return {
    content: textContent,
    usage: completion.usage ? {
      promptTokens: completion.usage.input_tokens,
      completionTokens: completion.usage.output_tokens,
      totalTokens: completion.usage.input_tokens + completion.usage.output_tokens,
    } : undefined
  };
}

// Streaming implementations

// OpenAI streaming completion
async function createOpenAIStreamingCompletion(options: AICompletionOptions): Promise<AIStreamingCompletionResponse> {
  const client = getOpenAIClient();
  
  // Determine if this is a newer model that uses max_completion_tokens
  const usesCompletionTokens =
    options.model.startsWith('o1') ||
    options.model.startsWith('o3') ||
    options.model.startsWith('o4') ||
    options.model.startsWith('gpt-5') ||
    options.model.startsWith('gpt-4.1') ||
    options.model.includes('gpt-4o');
  
  const requestParams: any = {
    model: options.model,
    messages: options.messages.map(msg => ({
      role: msg.role,
      content: msg.content
    })),
    stream: true,
  };

  // Add parameters based on model type
  if (usesCompletionTokens) {
    requestParams.max_completion_tokens = options.maxTokens ? Math.max(options.maxTokens, 2000) : 2000;
  } else {
    requestParams.temperature = options.temperature !== undefined ? options.temperature : 0.25;
    requestParams.max_tokens = options.maxTokens || 500;
    requestParams.frequency_penalty = options.frequencyPenalty || 0.2;
    requestParams.presence_penalty = options.presencePenalty || 0.2;
  }

  const stream = await client.chat.completions.create(requestParams);
  
  const encoder = new TextEncoder();
  const readableStream = new ReadableStream({
    async start(controller) {
      try {
        console.log('🔍 STREAMING DEBUG: Starting OpenAI stream processing');
        let chunkCount = 0;
        let contentChunks = 0;
        
        for await (const chunk of stream as any) {
          chunkCount++;
          console.log('🔍 STREAMING DEBUG: Chunk', chunkCount, 'received:', JSON.stringify(chunk));
          
          const content = chunk.choices[0]?.delta?.content;
          if (content) {
            contentChunks++;
            console.log('🔍 STREAMING DEBUG: Content found in chunk', chunkCount, ':', content.length, 'chars');
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'chunk', content })}\n\n`));
          } else {
            console.log('🔍 STREAMING DEBUG: No content in chunk', chunkCount, '- delta:', JSON.stringify(chunk.choices[0]?.delta));
          }
        }
        
        console.log('🔍 STREAMING DEBUG: Stream complete -', chunkCount, 'total chunks,', contentChunks, 'with content');
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } catch (error) {
        console.error('🔍 STREAMING DEBUG: Stream error:', error);
        controller.error(error);
      }
    }
  });

  return { stream: readableStream };
}

// DeepSeek streaming completion
async function createDeepSeekStreamingCompletion(options: AICompletionOptions): Promise<AIStreamingCompletionResponse> {
  const client = getDeepSeekClient();
  
  const stream = await client.chat.completions.create({
    model: options.model,
    messages: options.messages.map(msg => ({
      role: msg.role,
      content: msg.content
    })),
    temperature: options.temperature !== undefined ? options.temperature : 0.25,
    max_tokens: options.maxTokens || 500,
    stream: true,
  });
  
  const encoder = new TextEncoder();
  const readableStream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream as any) {
          const content = chunk.choices[0]?.delta?.content;
          if (content) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'chunk', content })}\n\n`));
          }
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    }
  });

  return { stream: readableStream };
}

// Gemini streaming completion
async function createGeminiStreamingCompletion(options: AICompletionOptions): Promise<AIStreamingCompletionResponse> {
  const client = getGeminiClient();
  
  const stream = await client.chat.completions.create({
    model: options.model,
    messages: options.messages.map(msg => ({
      role: msg.role,
      content: msg.content
    })),
    temperature: options.temperature !== undefined ? options.temperature : 0.25,
    max_tokens: options.maxTokens || 500,
    stream: true,
  });
  
  const encoder = new TextEncoder();
  const readableStream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream as any) {
          const content = chunk.choices[0]?.delta?.content;
          if (content) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'chunk', content })}\n\n`));
          }
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    }
  });

  return { stream: readableStream };
}

// Anthropic streaming completion
async function createAnthropicStreamingCompletion(options: AICompletionOptions): Promise<AIStreamingCompletionResponse> {
  const client = getAnthropicClient();
  
  // Convert messages to Anthropic format
  const messages = options.messages.filter(msg => msg.role !== 'system').map(msg => ({
    role: msg.role as 'user' | 'assistant',
    content: msg.content
  }));
  
  // Extract system message if present
  const systemMessage = options.messages.find(msg => msg.role === 'system');
  
  const requestParams: any = {
    model: options.model,
    max_tokens: options.maxTokens || 500,
    messages: messages,
    stream: true,
  };
  
  if (systemMessage) {
    requestParams.system = systemMessage.content;
  }

  // Omit `temperature` — see createAnthropicCompletion above.

  const stream = await client.messages.create(requestParams);
  
  const encoder = new TextEncoder();
  const readableStream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream as any) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            const content = chunk.delta.text;
            if (content) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'chunk', content })}\n\n`));
            }
          }
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    }
  });

  return { stream: readableStream };
}

// ---------------------------------------------------------------------------
// Tool-calling completions (Phase 2B consultant / shared agents)
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
  model: string;
  messages: AIToolLoopMessage[];
  tools: AIToolDefinition[];
  maxTokens?: number;
  toolChoice?: 'auto' | 'any' | 'none';
}

export interface AICompletionWithToolsResponse {
  content: string;
  toolCalls: AIToolCall[];
  stopReason: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * Provider-routed completion that supports tool definitions and tool_use responses.
 * Primary path: Anthropic. OpenAI tools supported as fallback when model is gpt-*.
 */
export async function createCompletionWithTools(
  options: AICompletionWithToolsOptions
): Promise<AICompletionWithToolsResponse> {
  const provider = getProvider(options.model);
  if (provider === 'anthropic') {
    return createAnthropicCompletionWithTools(options);
  }
  if (provider === 'openai') {
    return createOpenAICompletionWithTools(options);
  }
  const text = await createCompletion({
    model: options.model,
    messages: options.messages
      .filter((m): m is AIMessage => m.role === 'system' || m.role === 'user' || m.role === 'assistant')
      .map((m) => ({
        role: m.role as 'system' | 'user' | 'assistant',
        content: typeof (m as any).content === 'string' ? (m as any).content : '',
      })),
    maxTokens: options.maxTokens,
  });
  return { content: text.content, toolCalls: [], stopReason: 'end_turn', usage: text.usage };
}

async function createAnthropicCompletionWithTools(
  options: AICompletionWithToolsOptions
): Promise<AICompletionWithToolsResponse> {
  const client = getAnthropicClient();

  const systemParts = options.messages
    .filter((m) => m.role === 'system')
    .map((m) => (typeof (m as AISystemMessage).content === 'string' ? (m as AISystemMessage).content : ''))
    .filter(Boolean);

  type AnthContent = any;
  const anthMessages: { role: 'user' | 'assistant'; content: string | AnthContent[] }[] = [];

  for (const msg of options.messages) {
    if (msg.role === 'system') continue;

    if (msg.role === 'user') {
      anthMessages.push({ role: 'user', content: (msg as AIUserTextMessage).content || '' });
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
      input: (b.input && typeof b.input === 'object' ? b.input : {}) as Record<string, unknown>,
    }));

  return {
    content: textContent,
    toolCalls,
    stopReason: String(completion.stop_reason || (toolCalls.length ? 'tool_use' : 'end_turn')),
    usage: completion.usage
      ? {
          promptTokens: completion.usage.input_tokens,
          completionTokens: completion.usage.output_tokens,
          totalTokens: completion.usage.input_tokens + completion.usage.output_tokens,
        }
      : undefined,
  };
}

async function createOpenAICompletionWithTools(
  options: AICompletionWithToolsOptions
): Promise<AICompletionWithToolsResponse> {
  const client = getOpenAIClient();
  const oaiMessages: any[] = [];

  for (const msg of options.messages) {
    if (msg.role === 'system') {
      oaiMessages.push({ role: 'system', content: (msg as AISystemMessage).content });
    } else if (msg.role === 'user') {
      oaiMessages.push({ role: 'user', content: (msg as AIUserTextMessage).content });
    } else if (msg.role === 'assistant') {
      const assistant = msg as AIAssistantToolMessage | AIMessage;
      const toolCalls = (assistant as AIAssistantToolMessage).toolCalls || [];
      oaiMessages.push({
        role: 'assistant',
        content: assistant.content || null,
        tool_calls: toolCalls.length
          ? toolCalls.map((c) => ({
              id: c.id,
              type: 'function',
              function: { name: c.name, arguments: JSON.stringify(c.input || {}) },
            }))
          : undefined,
      });
    } else if (msg.role === 'tool') {
      const toolMsg = msg as AIToolResultMessage;
      oaiMessages.push({
        role: 'tool',
        tool_call_id: toolMsg.toolCallId,
        content: toolMsg.content,
      });
    }
  }

  const completion = await client.chat.completions.create({
    model: options.model,
    messages: oaiMessages,
    max_completion_tokens: options.maxTokens || 2000,
    tools: (options.tools || []).map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema || { type: 'object', properties: {} },
      },
    })),
    tool_choice: options.toolChoice === 'none' ? 'none' : 'auto',
  });

  const choice = completion.choices[0];
  const message = choice?.message;
  const toolCalls: AIToolCall[] = (message?.tool_calls || []).map((c: any) => {
    let input: Record<string, unknown> = {};
    try {
      input = JSON.parse(c.function?.arguments || '{}');
    } catch {
      input = {};
    }
    return { id: String(c.id), name: String(c.function?.name || ''), input };
  });

  return {
    content: message?.content || '',
    toolCalls,
    stopReason: toolCalls.length ? 'tool_use' : String(choice?.finish_reason || 'stop'),
    usage: completion.usage
      ? {
          promptTokens: completion.usage.prompt_tokens,
          completionTokens: completion.usage.completion_tokens,
          totalTokens: completion.usage.total_tokens,
        }
      : undefined,
  };
} 