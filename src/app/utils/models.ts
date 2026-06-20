// Available models by provider - safe for client-side import
// Last updated: Feb 2026 — see https://platform.openai.com/docs/models
export const AVAILABLE_MODELS = {
  openai: [
    // GPT-5.x family (frontier)
    { id: 'gpt-5.2', name: 'GPT-5.2', provider: 'OpenAI' },
    { id: 'gpt-5.1', name: 'GPT-5.1', provider: 'OpenAI' },
    { id: 'gpt-5', name: 'GPT-5', provider: 'OpenAI' },
    { id: 'gpt-5-mini', name: 'GPT-5 Mini', provider: 'OpenAI' },
    { id: 'gpt-5-nano', name: 'GPT-5 Nano', provider: 'OpenAI' },
    // Reasoning models
    { id: 'o4-mini', name: 'o4-mini', provider: 'OpenAI' },
    { id: 'o3', name: 'o3', provider: 'OpenAI' },
    { id: 'o3-mini', name: 'o3-mini', provider: 'OpenAI' },
    // GPT-4.1 family
    { id: 'gpt-4.1', name: 'GPT-4.1', provider: 'OpenAI' },
    { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', provider: 'OpenAI' },
    { id: 'gpt-4.1-nano', name: 'GPT-4.1 Nano', provider: 'OpenAI' },
    // GPT-4o family (legacy, being deprecated)
    { id: 'gpt-4o', name: 'GPT-4o', provider: 'OpenAI' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'OpenAI' },
  ],
  deepseek: [
    { id: 'deepseek-chat', name: 'DeepSeek Chat', provider: 'DeepSeek' },
    { id: 'deepseek-coder', name: 'DeepSeek Coder', provider: 'DeepSeek' },
  ],
  gemini: [
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'Google' },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', provider: 'Google' },
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', provider: 'Google' },
  ],
  anthropic: [
    { id: 'claude-opus-4-8', name: 'Claude Opus 4.8', provider: 'Anthropic' },
    { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', provider: 'Anthropic' },
    { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', provider: 'Anthropic' },
  ],
};

// Get all available models as a flat array
export const getAllModels = () => {
  return [
    ...AVAILABLE_MODELS.openai,
    ...AVAILABLE_MODELS.deepseek,
    ...AVAILABLE_MODELS.gemini,
    ...AVAILABLE_MODELS.anthropic,
  ];
}; 