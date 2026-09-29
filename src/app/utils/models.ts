/**
 * Available models for UI pickers — Anthropic tiers only.
 * Ids are gateway tier names; the gateway resolves them to concrete model ids.
 */
export const AVAILABLE_MODELS = {
  anthropic: [
    {
      id: 'workhorse',
      name: 'Workhorse (Sonnet)',
      provider: 'Anthropic',
      tier: 'workhorse' as const,
    },
    {
      id: 'heavy',
      name: 'Heavy (Opus)',
      provider: 'Anthropic',
      tier: 'heavy' as const,
    },
    {
      id: 'cheap',
      name: 'Cheap (Haiku)',
      provider: 'Anthropic',
      tier: 'cheap' as const,
    },
  ],
};

/** Flat list for dropdowns — Anthropic tiers only. */
export const getAllModels = () => {
  return [...AVAILABLE_MODELS.anthropic];
};
