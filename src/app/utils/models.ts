// Available models by provider - safe for client-side import.
// Only the latest OpenAI and Anthropic (Claude) models are offered (these are
// the providers with configured API keys). Verified available on the account.
export const AVAILABLE_MODELS = {
  openai: [
    { id: 'gpt-5.5', name: 'GPT-5.5', provider: 'OpenAI' },
    { id: 'gpt-5.4', name: 'GPT-5.4', provider: 'OpenAI' },
    { id: 'gpt-5.2', name: 'GPT-5.2', provider: 'OpenAI' },
    { id: 'gpt-5.1', name: 'GPT-5.1', provider: 'OpenAI' },
    { id: 'gpt-4.1', name: 'GPT-4.1', provider: 'OpenAI' },
    { id: 'gpt-4o', name: 'GPT-4o', provider: 'OpenAI' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'OpenAI' },
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
    ...AVAILABLE_MODELS.anthropic,
  ];
}; 