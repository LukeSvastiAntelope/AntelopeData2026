import type { CampaignTool } from './types';

type Input = {
  topic?: string;
  platforms?: string[];
  tone?: string;
};

/** Stub — social post drafting is not wired yet. */
export const draftPostsTool: CampaignTool<Input> = {
  name: 'draft_posts',
  description:
    'Draft social/content posts for the campaign. Not implemented yet — returns an honest not-implemented result so the agent does not invent posts.',
  inputSchema: {
    type: 'object',
    properties: {
      topic: { type: 'string' },
      platforms: {
        type: 'array',
        items: { type: 'string' },
        description: 'e.g. twitter, facebook, nextdoor',
      },
      tone: { type: 'string' },
    },
    additionalProperties: false,
  },
  risk: 'auto',
  async execute(input) {
    return {
      summary:
        'Not implemented: `draft_posts` is not available yet. Do not invent social copy as if this tool produced it. Suggest the candidate outline posts manually or wait for Auto-Post tooling.',
      data: {
        implemented: false,
        reason: 'No social/auto-post drafting service exists yet.',
        requested: {
          topic: input.topic ?? null,
          platforms: input.platforms ?? [],
          tone: input.tone ?? null,
        },
      },
    };
  },
};
