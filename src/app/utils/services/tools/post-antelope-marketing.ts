import type { CampaignTool } from './types';

type Input = {
  body?: string;
  topic?: string;
  channel?: string;
  handle?: string;
};

/**
 * Admin A5 — Antelope own-growth X post.
 * risk=approval: executor always holds until a human confirms.
 * Live publish is intentionally not implemented here — Approve is review-only
 * for growth drafts (see antelope-growth-service). Never auto-posts.
 */
export const postAntelopeMarketingTool: CampaignTool<Input> = {
  name: 'post_antelope_marketing',
  description:
    'Stage an Antelope-owned Twitter/X marketing post for Luke\'s approval. Platform growth only — never a candidate campaign send. Does not post until a human approves; even then live X API publish is a separate follow-on.',
  inputSchema: {
    type: 'object',
    properties: {
      body: { type: 'string', description: 'Post text (≤280 chars)' },
      topic: { type: 'string' },
      channel: { type: 'string', description: 'twitter' },
      handle: { type: 'string' },
    },
    required: ['body'],
    additionalProperties: false,
  },
  risk: 'approval',
  async execute(input) {
    // If somehow executed with approved:true, still do not live-post.
    return {
      summary: [
        'Antelope marketing draft acknowledged.',
        'Live X API publish is not wired in this tool (OpenClaw follow-on).',
        'Use Admin → Growth to mark a draft posted after you publish manually.',
        input.body ? `Copy: ${String(input.body).slice(0, 200)}` : '',
      ]
        .filter(Boolean)
        .join(' '),
      data: {
        implemented: true,
        livePost: false,
        neverAutoPost: true,
        body: input.body ?? null,
        topic: input.topic ?? null,
        handle: input.handle ?? 'antelopeHQ',
      },
    };
  },
};
