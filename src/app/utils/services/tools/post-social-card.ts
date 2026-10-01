import type { CampaignTool } from './types';

type Input = {
  mediaUrl?: string;
  storageKey?: string;
  caption?: string;
  headline?: string;
  platform?: string;
  caveat?: string;
  format?: string;
  sourceLine?: string;
};

/**
 * Stage a shareable chart social card (image) for human-gated distribution.
 * Does NOT post — approval queue + Zapier/Make only.
 */
export const postSocialCardTool: CampaignTool<Input> = {
  name: 'post_social_card',
  description:
    'Stage a branded social card image (chart + headline + caveat) for human review before distribution. Requires approval. Nothing is published until Approve.',
  inputSchema: {
    type: 'object',
    properties: {
      mediaUrl: {
        type: 'string',
        description: 'Authenticated /api/media URL or storage key for the card PNG',
      },
      storageKey: { type: 'string' },
      caption: { type: 'string', description: 'Suggested social caption' },
      headline: { type: 'string' },
      platform: {
        type: 'string',
        description: 'linkedin | instagram | story',
      },
      caveat: { type: 'string' },
      format: { type: 'string' },
      sourceLine: { type: 'string' },
    },
    required: ['mediaUrl'],
    additionalProperties: false,
  },
  risk: 'approval',
  async execute(input) {
    const mediaUrl = String(input.mediaUrl || input.storageKey || '').trim();
    if (!mediaUrl) {
      throw new Error('mediaUrl is required');
    }
    const caption = String(input.caption || input.headline || '').trim();
    const platform = String(input.platform || 'linkedin').trim();
    return {
      summary: [
        '### Social card ready for distribution review',
        input.headline ? `Headline: ${input.headline}` : null,
        caption ? `Caption: ${caption}` : null,
        platform ? `Intended platform: ${platform}` : null,
        input.format ? `Format: ${input.format}` : null,
        input.caveat ? `Caveat included.` : null,
        '',
        '**Not posted.** Approve on the card to send via your Zapier/Make image destinations.',
      ]
        .filter(Boolean)
        .join('\n'),
      data: {
        implemented: true,
        posted: false,
        worldTouching: false,
        mediaUrl,
        storageKey: input.storageKey ? String(input.storageKey) : null,
        caption: caption || null,
        headline: input.headline ? String(input.headline) : null,
        platform,
        format: input.format ? String(input.format) : null,
        caveat: input.caveat ? String(input.caveat) : null,
        sourceLine: input.sourceLine ? String(input.sourceLine) : null,
        contentType: 'image',
      },
    };
  },
};
