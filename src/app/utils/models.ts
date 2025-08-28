// Available models by provider - safe for client-side import
export const AVAILABLE_MODELS = {
  openai: [
    // Latest models
    { id: 'o3-mini', name: 'o3-mini', provider: 'OpenAI' },
    { id: 'o3', name: 'o3', provider: 'OpenAI' },
    { id: 'o1', name: 'o1', provider: 'OpenAI' },
    { id: 'o1-mini', name: 'o1-mini', provider: 'OpenAI' },
    // GPT-5 family (requires access)
    { id: 'gpt-5', name: 'GPT-5', provider: 'OpenAI' },
    { id: 'gpt-5-mini', name: 'GPT-5 Mini', provider: 'OpenAI' },
    { id: 'gpt-5-turbo', name: 'GPT-5 Turbo', provider: 'OpenAI' },
    // GPT-4 family
    { id: 'gpt-4o', name: 'GPT-4o', provider: 'OpenAI' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'OpenAI' },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'OpenAI' },
    { id: 'gpt-4', name: 'GPT-4', provider: 'OpenAI' },
    { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', provider: 'OpenAI' },
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
    { id: 'claude-3-5-sonnet-latest', name: 'Claude 3.5 Sonnet', provider: 'Anthropic' },
    { id: 'claude-3-5-haiku-latest', name: 'Claude 3.5 Haiku', provider: 'Anthropic' },
    { id: 'claude-3-opus-latest', name: 'Claude 3 Opus', provider: 'Anthropic' },
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