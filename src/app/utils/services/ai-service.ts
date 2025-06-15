import OpenAI from 'openai';

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

// Initialize AI clients - only on server side
let openai: OpenAI | null = null;
let deepseek: OpenAI | null = null;

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

// Determine provider from model ID
function getProvider(modelId: string): 'openai' | 'deepseek' {
  if (modelId.startsWith('gpt-') || modelId.startsWith('o1') || modelId.startsWith('o3')) return 'openai';
  if (modelId.startsWith('deepseek-')) return 'deepseek';
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
    default:
      throw new Error(`Unsupported provider for model: ${options.model}`);
  }
}

// OpenAI completion
async function createOpenAICompletion(options: AICompletionOptions): Promise<AICompletionResponse> {
  const client = getOpenAIClient();
  
  // Determine if this is a newer model that uses max_completion_tokens
  const usesCompletionTokens = options.model.startsWith('o1') || options.model.startsWith('o3');
  
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
    requestParams.temperature = options.temperature || 0.25;
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
    temperature: options.temperature || 0.25,
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