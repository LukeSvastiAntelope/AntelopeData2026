import { clipUntilDone } from '@/app/utils/services/video/clip-service';
import type { VideoClipProviderId } from '@/app/utils/services/video/clippers';
import { assertOwnAssetUse } from '@/app/utils/services/video/guardrails';
import type { CampaignTool } from './types';

type Input = {
  sourceUrl: string;
  provider?: string;
  language?: string;
  maxClips?: number;
  maxDurationSeconds?: number;
  topicKeywords?: string[];
  /** Optional note — still scanned for public-figure abuse. */
  notes?: string;
};

/**
 * Clip a long video into ranked captioned shorts (Opus / Klap / mock).
 * Private & reversible — risk: auto. Posting stay behind generate_and_post_video approval.
 */
export const clipVideoTool: CampaignTool<Input> = {
  name: 'clip_video',
  description:
    'Turn a long speech/livestream/upload into ranked captioned short clips (Opus Clip or Klap). Private and reversible — does not post. Pick keepers, then stage with generate_and_post_video (approval) to publish.',
  inputSchema: {
    type: 'object',
    properties: {
      sourceUrl: {
        type: 'string',
        description: 'Public URL or /api/media/... path to the long source video',
      },
      provider: {
        type: 'string',
        description: 'opusclip | klap | mock',
      },
      language: { type: 'string' },
      maxClips: { type: 'number' },
      maxDurationSeconds: { type: 'number' },
      topicKeywords: { type: 'array', items: { type: 'string' } },
      notes: { type: 'string' },
    },
    required: ['sourceUrl'],
    additionalProperties: false,
  },
  risk: 'auto',
  async execute(input, ctx) {
    const sourceUrl = String(input.sourceUrl || '').trim();
    if (!sourceUrl) throw new Error('sourceUrl is required');

    const guard = assertOwnAssetUse({ prompt: input.notes || '', caption: '' });
    if (!guard.ok) {
      return {
        summary: `### Clip blocked\n${guard.reason}`,
        data: { implemented: true, blocked: true, reason: guard.reason },
      };
    }

    const job = await clipUntilDone({
      userId: ctx.userId,
      sourceUrl,
      provider: (input.provider as VideoClipProviderId) || undefined,
      language: input.language,
      maxClips: input.maxClips,
    });

    const top = (job.clips || []).slice(0, 5);
    return {
      summary: [
        `### Clipped via **${job.provider}**`,
        `Source: ${sourceUrl}`,
        `Returned ${job.clips.length} ranked short(s). Top hooks:`,
        ...top.map(
          (c, i) =>
            `${i + 1}. (score ${c.score}) ${c.hook}${c.url ? `\n   ${c.url}` : ''}`
        ),
        '',
        'Nothing posted. Pick keepers in Spread → Video → Clip, then Approve for post (human gate).',
      ].join('\n'),
      data: {
        implemented: true,
        posted: false,
        jobId: job.jobId,
        provider: job.provider,
        clips: job.clips,
        sourceUrl,
      },
    };
  },
};
