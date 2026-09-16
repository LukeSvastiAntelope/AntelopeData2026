import type { CampaignTool } from './types';

type Input = {
  script?: string;
  platform?: string;
  caption?: string;
};

/** Stub — no video generation or auto-post pipeline exists. */
export const generateAndPostVideoTool: CampaignTool<Input> = {
  name: 'generate_and_post_video',
  description:
    'Generate a campaign video and post it publicly. Not implemented — approval-gated stub. Media generate currently covers images only.',
  inputSchema: {
    type: 'object',
    properties: {
      script: { type: 'string' },
      platform: { type: 'string' },
      caption: { type: 'string' },
    },
    additionalProperties: false,
  },
  risk: 'approval',
  async execute(input) {
    return {
      summary:
        'Not implemented: `generate_and_post_video` cannot generate or post video. Even after approval, nothing was published. Do not invent a video URL or post confirmation.',
      data: {
        implemented: false,
        reason: 'No video generation or social auto-post pipeline; /api/media/generate is images only.',
        requested: {
          script: input.script ?? null,
          platform: input.platform ?? null,
          caption: input.caption ?? null,
        },
      },
    };
  },
};
