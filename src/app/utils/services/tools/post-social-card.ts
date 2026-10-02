import type { CampaignTool } from './types';
import {
  assertOwnedStorageKeyOrThrow,
  assertSocialCardAggregateColumnsOrThrow,
  enforceSocialCardCaveat,
  resolveOwnedSocialCardMediaOrThrow,
} from '@/app/utils/services/social-card-guards';

type Input = {
  mediaUrl?: string;
  storageKey?: string;
  caption?: string;
  headline?: string;
  platform?: string;
  caveat?: string;
  /** Ignored — server computes caveat-required from stats. */
  caveatRequired?: boolean;
  format?: string;
  sourceLine?: string;
  sampleN?: number | null;
  pValue?: number | null;
  sourceColumns?: string[];
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
        description: 'Must match owned /api/media/{storageKey}',
      },
      storageKey: {
        type: 'string',
        description: 'Owned media key (required)',
      },
      caption: { type: 'string', description: 'Suggested social caption' },
      headline: { type: 'string' },
      platform: {
        type: 'string',
        description: 'linkedin | instagram | story',
      },
      caveat: { type: 'string' },
      format: { type: 'string' },
      sourceLine: { type: 'string' },
      sampleN: { type: 'number' },
      pValue: { type: 'number' },
      sourceColumns: {
        type: 'array',
        items: { type: 'string' },
        description: 'Figure source columns recorded at render time',
      },
    },
    required: ['storageKey'],
    additionalProperties: false,
  },
  risk: 'approval',
  async execute(input, ctx) {
    const owned = resolveOwnedSocialCardMediaOrThrow({
      userId: ctx.userId,
      storageKey: input.storageKey,
      mediaUrl: input.mediaUrl,
    });
    assertOwnedStorageKeyOrThrow(ctx.userId, owned.storageKey);
    const columns = assertSocialCardAggregateColumnsOrThrow(input.sourceColumns);

    const stats = {
      sampleN:
        input.sampleN != null && Number.isFinite(Number(input.sampleN))
          ? Number(input.sampleN)
          : null,
      pValue:
        input.pValue != null && Number.isFinite(Number(input.pValue))
          ? Number(input.pValue)
          : null,
    };
    const enforced = enforceSocialCardCaveat({
      stats,
      clientCaveat: input.caveat,
      caption: String(input.caption || input.headline || '').trim(),
    });

    const platform = String(input.platform || 'linkedin').trim();
    return {
      summary: [
        '### Social card ready for distribution review',
        input.headline ? `Headline: ${input.headline}` : null,
        enforced.caption ? `Caption: ${enforced.caption}` : null,
        platform ? `Intended platform: ${platform}` : null,
        input.format ? `Format: ${input.format}` : null,
        enforced.caveat
          ? `Caveat included${enforced.required ? ' (required)' : ''}.`
          : null,
        '',
        '**Not posted.** Approve on the card to send via your Zapier/Make image destinations.',
      ]
        .filter(Boolean)
        .join('\n'),
      data: {
        implemented: true,
        posted: false,
        worldTouching: false,
        mediaUrl: owned.mediaUrl,
        storageKey: owned.storageKey,
        caption: enforced.caption || null,
        headline: input.headline ? String(input.headline) : null,
        platform,
        format: input.format ? String(input.format) : null,
        caveat: enforced.caveat,
        caveatRequired: enforced.required,
        sourceLine: input.sourceLine ? String(input.sourceLine) : null,
        sampleN: stats.sampleN,
        pValue: stats.pValue,
        sourceColumns: columns,
        contentType: 'image',
      },
    };
  },
};
