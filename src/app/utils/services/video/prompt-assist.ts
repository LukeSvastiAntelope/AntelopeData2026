/**
 * Prompt-assist: expand plain candidate language into model-tuned video prompts.
 * Uses claude-sonnet-4-6 via ai-service.
 */

import { createCompletion } from '@/app/utils/services/ai-service';
import type {
  VideoAspectRatio,
  VideoGenMode,
  VideoProviderId,
} from '@/app/utils/services/video/providers';
import { assertOwnAssetUse } from '@/app/utils/services/video/guardrails';

export type VideoTemplateId =
  | 'announcement'
  | 'issue_explainer'
  | 'gotv'
  | 'event_promo'
  | 'custom';

export type VideoTemplate = {
  id: VideoTemplateId;
  label: string;
  description: string;
  starterPrompt: string;
};

export const VIDEO_TEMPLATES: VideoTemplate[] = [
  {
    id: 'announcement',
    label: 'Announcement',
    description: 'Launch or endorsement-style spot',
    starterPrompt:
      '30-second announcement that I am running for office. Confident, warm, community pride.',
  },
  {
    id: 'issue_explainer',
    label: 'Issue explainer',
    description: 'Break down one policy clearly',
    starterPrompt:
      '30-sec clip explaining our housing plan — upbeat, city backdrop, plain language.',
  },
  {
    id: 'gotv',
    label: 'GOTV',
    description: 'Turnout urgency with polling info',
    starterPrompt:
      'Get-out-the-vote clip: election day is Tuesday, polls open 7am–8pm, bring ID if required. Energetic but not frantic.',
  },
  {
    id: 'event_promo',
    label: 'Event promo',
    description: 'Invite people to a canvass or town hall',
    starterPrompt:
      'Invite voters to Saturday morning canvass meet-up at the community center. Friendly, local, clear time and place.',
  },
  {
    id: 'custom',
    label: 'Custom',
    description: 'Start from a blank description',
    starterPrompt: '',
  },
];

export type StructuredVideoPrompt = {
  subject: string;
  motion: string;
  camera: string;
  style: string;
  durationSeconds: number;
  aspectRatio: VideoAspectRatio;
  /** Full model-ready prompt string. */
  modelPrompt: string;
  negativePrompt?: string;
  /** What we are doing with the uploaded reference (i2v/v2v). */
  referenceGuidance?: string;
  /** Short plain-language explanation for the candidate. */
  explanation: string;
};

function modelIdiom(provider: VideoProviderId): string {
  switch (provider) {
    case 'wan':
    case 'comfyui':
    case 'mock':
      return `Wan-family idiom: concrete nouns, clear subject, modest motion verbs, avoid long abstract rhetoric. Prefer "slow push-in", "gentle parallax", "handheld documentary" over cinematic jargon stacks.`;
    case 'higgsfield':
      return `Higgsfield idiom: cinematic lighting, polished production language, controlled camera moves, premium commercial look.`;
    case 'kling':
      return `Kling idiom: vivid motion, coherent physics, detailed scene continuity, short punchy clauses.`;
    default:
      return 'Clear, concrete visual language.';
  }
}

function modeGuidance(mode: VideoGenMode): string {
  if (mode === 'i2v') {
    return `Mode is image-to-video. Preserve the uploaded subject's identity and composition. Describe ambient motion and a subtle camera move — do not reinvent the person or scene. Explicitly say what you are doing with the photo.`;
  }
  if (mode === 'v2v') {
    return `Mode is video-to-video. Restyle or extend the uploaded clip while holding subject continuity. Describe the transform (grade, weather, energy) without discarding the source action.`;
  }
  return `Mode is text-to-video. Invent a complete scene from scratch.`;
}

export async function assistVideoPrompt(params: {
  plainDescription: string;
  provider: VideoProviderId;
  mode: VideoGenMode;
  templateId?: VideoTemplateId;
  aspectRatio?: VideoAspectRatio;
  durationSeconds?: number;
  hasReferenceImage?: boolean;
  hasReferenceVideo?: boolean;
}): Promise<StructuredVideoPrompt> {
  const plain = String(params.plainDescription || '').trim();
  if (!plain) throw new Error('plainDescription is required');

  const guard = assertOwnAssetUse({ prompt: plain });
  if (!guard.ok) {
    throw new Error(guard.reason || 'Prompt blocked by content guardrail');
  }

  const aspect = params.aspectRatio || '9:16';
  const duration = Math.min(Math.max(params.durationSeconds || 5, 2), 30);
  const template = VIDEO_TEMPLATES.find((t) => t.id === (params.templateId || 'custom'));

  const model = process.env.ANTHROPIC_API_KEY
    ? 'claude-sonnet-4-6'
    : process.env.OPENAI_API_KEY
      ? 'gpt-4o'
      : 'claude-sonnet-4-6';

  const completion = await createCompletion({
    model,
    temperature: 0.4,
    maxTokens: 1200,
    messages: [
      {
        role: 'system',
        content: `You expand plain campaign video briefs into structured prompts for generative video models.
Return ONLY valid JSON (no markdown fences):
{
  "subject": string,
  "motion": string,
  "camera": string,
  "style": string,
  "durationSeconds": number,
  "aspectRatio": "9:16"|"16:9"|"1:1",
  "modelPrompt": string,
  "negativePrompt": string,
  "referenceGuidance": string|null,
  "explanation": string
}
Rules: no invented endorsements or poll numbers; keep language civic and honest; never request logos of opponents; NEVER animate, impersonate, or likeness-swap other real public figures or opponents — only the candidate's own likeness/assets or clearly fictional scenes; ${modelIdiom(params.provider)} ${modeGuidance(params.mode)}`,
      },
      {
        role: 'user',
        content: [
          `Candidate brief: ${plain}`,
          template && template.id !== 'custom'
            ? `Template: ${template.label} — ${template.description}`
            : null,
          `Provider: ${params.provider}`,
          `Mode: ${params.mode}`,
          `Target aspect: ${aspect}`,
          `Target duration seconds: ${duration}`,
          params.hasReferenceImage ? 'Reference image: uploaded' : null,
          params.hasReferenceVideo ? 'Reference video: uploaded' : null,
        ]
          .filter(Boolean)
          .join('\n'),
      },
    ],
  });

  const raw = (completion.content || '').trim();
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    // Graceful fallback — still usable
    return fallbackStructured(plain, params.mode, aspect, duration);
  }
  try {
    const parsed = JSON.parse(jsonMatch[0]) as Partial<StructuredVideoPrompt>;
    return {
      subject: String(parsed.subject || plain).slice(0, 400),
      motion: String(parsed.motion || 'subtle ambient motion').slice(0, 400),
      camera: String(parsed.camera || 'slow push-in').slice(0, 400),
      style: String(parsed.style || 'clean documentary').slice(0, 400),
      durationSeconds: Number(parsed.durationSeconds) || duration,
      aspectRatio: (parsed.aspectRatio as VideoAspectRatio) || aspect,
      modelPrompt: String(parsed.modelPrompt || plain).slice(0, 2000),
      negativePrompt: parsed.negativePrompt
        ? String(parsed.negativePrompt).slice(0, 800)
        : 'blurry, watermark, text overlay, distorted faces, violent imagery',
      referenceGuidance: parsed.referenceGuidance
        ? String(parsed.referenceGuidance).slice(0, 800)
        : params.mode === 't2v'
          ? undefined
          : 'Hold the uploaded subject; add subtle motion only.',
      explanation: String(
        parsed.explanation ||
          'Expanded your brief into a model-ready prompt. Review before generating.'
      ).slice(0, 800),
    };
  } catch {
    return fallbackStructured(plain, params.mode, aspect, duration);
  }
}

function fallbackStructured(
  plain: string,
  mode: VideoGenMode,
  aspect: VideoAspectRatio,
  duration: number
): StructuredVideoPrompt {
  const referenceGuidance =
    mode === 'i2v'
      ? 'Hold the subject in the uploaded photo; add a subtle push-in and ambient motion.'
      : mode === 'v2v'
        ? 'Restyle the uploaded clip while preserving the original action and subject.'
        : undefined;
  const modelPrompt = [
    plain,
    'clean documentary campaign style, natural light, authentic community setting',
    mode === 'i2v' ? referenceGuidance : null,
    mode === 'v2v' ? referenceGuidance : null,
    `${aspect} vertical-friendly framing`,
  ]
    .filter(Boolean)
    .join('. ');
  return {
    subject: plain.slice(0, 200),
    motion: 'subtle ambient motion',
    camera: 'slow push-in',
    style: 'clean documentary',
    durationSeconds: duration,
    aspectRatio: aspect,
    modelPrompt,
    negativePrompt: 'blurry, watermark, text overlay, distorted faces',
    referenceGuidance,
    explanation:
      'Used a safe fallback expansion (model JSON parse missed). You can edit the prompt before generating.',
  };
}
