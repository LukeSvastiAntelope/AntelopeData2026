import { generateVideoUntilDone } from '@/app/utils/services/video/generate-service';
import type { VideoGenMode, VideoProviderId } from '@/app/utils/services/video/providers';
import type { CampaignTool } from './types';

type Input = {
  script?: string;
  prompt?: string;
  caption?: string;
  platform?: string;
  /** When already generated in the studio — skip regen and stage for post review. */
  videoUrl?: string;
  provider?: string;
  mode?: string;
  aspectRatio?: string;
  referenceImage?: string;
  referenceVideo?: string;
};

/**
 * Generate a campaign video (via Wan/provider abstraction) and stage the result
 * for human-gated distribution. Does NOT post to social platforms.
 * Risk stays 'approval' — executor enforces the human gate.
 */
export const generateAndPostVideoTool: CampaignTool<Input> = {
  name: 'generate_and_post_video',
  description:
    'Generate a campaign video (Wan by default) for human review, then prepare it for posting. Requires approval. Generation may run on approve; nothing is published to social platforms from this tool — the human gate remains the only path to distribution.',
  inputSchema: {
    type: 'object',
    properties: {
      script: { type: 'string', description: 'Plain or model prompt / script' },
      prompt: { type: 'string', description: 'Alias for script' },
      caption: { type: 'string', description: 'Suggested social caption' },
      platform: { type: 'string', description: 'Target platform label (TikTok, Reels, etc.)' },
      videoUrl: {
        type: 'string',
        description: 'Existing generated asset URL — skip generation, review for post only',
      },
      provider: { type: 'string', description: 'wan | higgsfield | kling | mock | comfyui' },
      mode: { type: 'string', description: 't2v | i2v | v2v' },
      aspectRatio: { type: 'string' },
      referenceImage: { type: 'string' },
      referenceVideo: { type: 'string' },
    },
    additionalProperties: false,
  },
  risk: 'approval',
  async execute(input, ctx) {
    const caption = String(input.caption || '').trim();
    const platform = String(input.platform || 'tiktok').trim();
    const existingUrl = String(input.videoUrl || '').trim();

    let videoUrl = existingUrl;
    let generated = false;
    let providerUsed: string | null = null;
    let localAssetUrl: string | null = null;

    if (!videoUrl) {
      const prompt = String(input.prompt || input.script || '').trim();
      if (!prompt) {
        throw new Error('script/prompt or videoUrl is required');
      }
      const mode = (String(input.mode || 't2v') as VideoGenMode) || 't2v';
      const job = await generateVideoUntilDone({
        userId: ctx.userId,
        prompt,
        modelPrompt: prompt,
        provider: (input.provider as VideoProviderId) || undefined,
        mode,
        aspectRatio: (input.aspectRatio as any) || '9:16',
        referenceImage: input.referenceImage || null,
        referenceVideo: input.referenceVideo || null,
      });
      videoUrl = job.localAssetUrl || job.assetUrl || '';
      localAssetUrl = job.localAssetUrl || null;
      providerUsed = job.provider;
      generated = true;
      if (!videoUrl) {
        throw new Error('Video generation finished without an asset URL');
      }
    }

    return {
      summary: [
        '### Video ready for distribution review',
        generated
          ? `Generated via **${providerUsed || 'provider'}**.`
          : 'Used an existing studio asset.',
        videoUrl ? `Preview: ${videoUrl}` : null,
        caption ? `Caption: ${caption}` : null,
        platform ? `Intended platform: ${platform}` : null,
        '',
        '**Not posted.** Social publish is still human-gated and not auto-executed by this tool.',
      ]
        .filter(Boolean)
        .join('\n'),
      data: {
        implemented: true,
        posted: false,
        worldTouching: false,
        generated,
        videoUrl,
        localAssetUrl,
        provider: providerUsed,
        caption: caption || null,
        platform,
        requested: {
          script: input.script ?? null,
          prompt: input.prompt ?? null,
          platform: input.platform ?? null,
          caption: input.caption ?? null,
        },
      },
    };
  },
};
