/**
 * AT2 — Auto-trigger output generation (newsletter + video drafts) with
 * mandatory small-sample disclaimer. Reuses ai-service + video providers;
 * stages drafts via consultant_staged_actions (never posts).
 */

import { createCompletion } from '@/app/utils/services/ai-service';
import { ConsultantRepo } from '@/app/utils/database/consultant-repo';
import { generateVideoUntilDone } from '@/app/utils/services/video/generate-service';
import {
  POSTABLE_INSIGHT_THRESHOLDS,
  type ComputedContrast,
} from '@/app/utils/services/postable-insight-service';
import type { AutotriggerAction } from '@/app/utils/database/survey-autotrigger-repo';

/** Visible caveat baked into thin / directional outputs — never optional. */
export const SMALL_SAMPLE_DISCLAIMER =
  'Small-sample caveat: this finding is based on a limited number of responses and may not generalize. Treat it as directional, not definitive.';

export type FindingDraftSource = {
  claim: string;
  caveat: string;
  suggestedAngle?: string;
  nA: number;
  nB: number;
  effect?: number;
  pCorrected?: number;
  flag: 'publishable' | 'directional_only';
  outcomePrompt?: string;
  groupA?: string;
  groupB?: string;
  groupingField?: string;
  contrastId?: string;
  totalResponses?: number;
};

export type OutputGenerationOptions = {
  /** Template copy only — no LLM / no real video wait (smoke). */
  mockOutputs?: boolean;
  /** Skip provider generate; still stage caption + placeholder URL. */
  skipVideoGenerate?: boolean;
};

export type StagedDraftResult = {
  kind: 'newsletter' | 'video';
  stagedActionId: number;
  disclaimerApplied: boolean;
  bodyOrCaption: string;
  videoUrl?: string | null;
};

export type GenerateOutputsResult = {
  finding: FindingDraftSource | null;
  drafts: StagedDraftResult[];
  skippedReason?: string;
};

/** Comfortable cell size = gate minCellSize; thin if under that or directional. */
export function needsSmallSampleDisclaimer(
  finding: FindingDraftSource,
  thresholds = POSTABLE_INSIGHT_THRESHOLDS
): boolean {
  if (finding.flag === 'directional_only') return true;
  const cell = Math.min(finding.nA, finding.nB);
  if (cell < thresholds.minCellSize) return true;
  if (
    finding.totalResponses != null &&
    finding.totalResponses < thresholds.minTotalResponses
  ) {
    return true;
  }
  return false;
}

export function bakeDisclaimerIntoText(
  body: string,
  apply: boolean,
  placement: 'newsletter' | 'caption' = 'newsletter'
): string {
  const trimmed = (body || '').trim();
  if (!apply) return trimmed;
  if (trimmed.toLowerCase().includes('small-sample caveat')) return trimmed;
  if (placement === 'caption') {
    return `${trimmed}\n\n${SMALL_SAMPLE_DISCLAIMER}`.trim();
  }
  return `${trimmed}\n\n---\n${SMALL_SAMPLE_DISCLAIMER}`.trim();
}

export function contrastToFinding(
  c: ComputedContrast,
  totalResponses?: number
): FindingDraftSource {
  const claim = [
    c.outcomePrompt,
    c.outcomeValue ? `(${c.outcomeValue})` : null,
    `differs by ${(c.absoluteEffect * 100).toFixed(1)}pp between`,
    `${c.groupingField}=${c.groupA} (n=${c.nA}) and ${c.groupB} (n=${c.nB})`,
  ]
    .filter(Boolean)
    .join(' ');
  return {
    claim,
    caveat: c.uncertaintyNote,
    nA: c.nA,
    nB: c.nB,
    effect: c.absoluteEffect,
    pCorrected: c.pCorrected,
    flag: c.flag,
    outcomePrompt: c.outcomePrompt,
    groupA: c.groupA,
    groupB: c.groupB,
    groupingField: c.groupingField,
    contrastId: c.id,
    totalResponses,
  };
}

export function candidateToFinding(
  c: Record<string, unknown>,
  totalResponses?: number
): FindingDraftSource {
  return {
    claim: String(c.claim || ''),
    caveat: String(c.honestCaveat || c.caveat || ''),
    suggestedAngle: c.suggestedAngle ? String(c.suggestedAngle) : undefined,
    nA: Number(c.nA) || 0,
    nB: Number(c.nB) || 0,
    effect: c.effect != null ? Number(c.effect) : undefined,
    pCorrected: c.pCorrected != null ? Number(c.pCorrected) : undefined,
    flag: 'publishable',
    outcomePrompt: c.outcomePrompt ? String(c.outcomePrompt) : undefined,
    groupA: c.groupA ? String(c.groupA) : undefined,
    groupB: c.groupB ? String(c.groupB) : undefined,
    groupingField: c.groupingField ? String(c.groupingField) : undefined,
    contrastId: c.contrastId ? String(c.contrastId) : undefined,
    totalResponses,
  };
}

function templateNewsletter(finding: FindingDraftSource, surveyTitle: string): {
  subject: string;
  body: string;
} {
  const subject = `Insight from ${surveyTitle}: ${finding.claim.slice(0, 72)}`;
  const body = [
    `Hi —`,
    ``,
    `A finding from our latest survey (${surveyTitle}):`,
    ``,
    finding.claim,
    ``,
    finding.suggestedAngle
      ? `Why it matters: ${finding.suggestedAngle}`
      : null,
    finding.caveat ? `Context: ${finding.caveat}` : null,
    ``,
    `We'll share more as the sample grows.`,
  ]
    .filter((l) => l != null)
    .join('\n');
  return { subject, body };
}

function templateCaption(finding: FindingDraftSource): string {
  return [
    finding.claim.slice(0, 180),
    finding.suggestedAngle ? finding.suggestedAngle.slice(0, 100) : null,
  ]
    .filter(Boolean)
    .join(' — ');
}

async function generateNewsletterCopy(params: {
  finding: FindingDraftSource;
  surveyTitle: string;
  mockOutputs?: boolean;
}): Promise<{ subject: string; body: string }> {
  if (params.mockOutputs) {
    return templateNewsletter(params.finding, params.surveyTitle);
  }
  try {
    const result = await createCompletion({
      model: process.env.AT2_NEWSLETTER_MODEL || 'gpt-4o-mini',
      temperature: 0.5,
      maxTokens: 700,
      messages: [
        {
          role: 'system',
          content:
            'You are a careful political campaign newsletter copywriter. Write factual, non-hyperbolic copy. Do not invent statistics. Return JSON only: {"subject":"...","body":"..."}.',
        },
        {
          role: 'user',
          content: [
            `Survey: ${params.surveyTitle}`,
            `Finding claim: ${params.finding.claim}`,
            `Statistical caveat: ${params.finding.caveat}`,
            params.finding.suggestedAngle
              ? `Suggested angle: ${params.finding.suggestedAngle}`
              : null,
            `Cell sizes: nA=${params.finding.nA}, nB=${params.finding.nB}`,
            `Flag: ${params.finding.flag}`,
            ``,
            `Write a short newsletter (subject + body, body ≤ 700 chars of prose).`,
            `Do NOT include a small-sample disclaimer — that is appended separately.`,
          ]
            .filter(Boolean)
            .join('\n'),
        },
      ],
    });
    const raw = (result.content || '').trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as { subject?: string; body?: string };
      if (parsed.body) {
        return {
          subject: String(parsed.subject || `Update from ${params.surveyTitle}`).slice(0, 160),
          body: String(parsed.body).trim(),
        };
      }
    }
  } catch (e) {
    console.warn(
      '[AT2] newsletter LLM failed; using template:',
      e instanceof Error ? e.message : e
    );
  }
  return templateNewsletter(params.finding, params.surveyTitle);
}

async function generateVideoScript(params: {
  finding: FindingDraftSource;
  surveyTitle: string;
  mockOutputs?: boolean;
}): Promise<{ script: string; caption: string }> {
  if (params.mockOutputs) {
    const caption = templateCaption(params.finding);
    return {
      script: `Short civic explainer video about: ${params.finding.claim}. Calm, factual, no invented numbers.`,
      caption,
    };
  }
  try {
    const result = await createCompletion({
      model: process.env.AT2_VIDEO_MODEL || 'gpt-4o-mini',
      temperature: 0.4,
      maxTokens: 400,
      messages: [
        {
          role: 'system',
          content:
            'You write short campaign video scripts and captions from survey findings. No invented stats. Return JSON only: {"script":"...","caption":"..."}.',
        },
        {
          role: 'user',
          content: [
            `Survey: ${params.surveyTitle}`,
            `Finding: ${params.finding.claim}`,
            `Caveat: ${params.finding.caveat}`,
            `Write a ≤30s script and a social caption. Do NOT include a small-sample disclaimer.`,
          ].join('\n'),
        },
      ],
    });
    const raw = (result.content || '').trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as { script?: string; caption?: string };
      if (parsed.script || parsed.caption) {
        return {
          script: String(
            parsed.script ||
              `Factual explainer: ${params.finding.claim}`
          ).trim(),
          caption: String(parsed.caption || templateCaption(params.finding)).trim(),
        };
      }
    }
  } catch (e) {
    console.warn(
      '[AT2] video copy LLM failed; using template:',
      e instanceof Error ? e.message : e
    );
  }
  return {
    script: `Short civic explainer video about: ${params.finding.claim}. Calm, factual.`,
    caption: templateCaption(params.finding),
  };
}

/**
 * Generate newsletter and/or video drafts for a finding and stage them
 * on the survey owner's consultant conversation (approval-card pattern).
 */
export async function generateAndStageAutotriggerOutputs(params: {
  surveyId: number;
  surveyTitle: string;
  userId: number;
  organizationId?: number | null;
  actions: AutotriggerAction[];
  finding: FindingDraftSource;
  options?: OutputGenerationOptions;
}): Promise<GenerateOutputsResult> {
  const wantNewsletter = params.actions.includes('newsletter');
  const wantVideo = params.actions.includes('video');
  if (!wantNewsletter && !wantVideo) {
    return {
      finding: params.finding,
      drafts: [],
      skippedReason: 'no_output_actions',
    };
  }

  const disclaimer = needsSmallSampleDisclaimer(params.finding);
  const conversation = await ConsultantRepo.getOrCreateConversation({
    userId: params.userId,
    organizationId: params.organizationId ?? null,
  });

  const drafts: StagedDraftResult[] = [];
  const mock = Boolean(params.options?.mockOutputs);

  if (wantNewsletter) {
    const copy = await generateNewsletterCopy({
      finding: params.finding,
      surveyTitle: params.surveyTitle,
      mockOutputs: mock,
    });
    const body = bakeDisclaimerIntoText(copy.body, disclaimer, 'newsletter');
    const staged = await ConsultantRepo.createStagedAction({
      conversationId: conversation.id,
      toolName: 'draft_newsletter',
      summary: [
        `### Newsletter draft — survey #${params.surveyId}`,
        copy.subject,
        disclaimer ? '_Small-sample disclaimer included in body._' : null,
        '',
        'Staged for review — not sent.',
      ]
        .filter(Boolean)
        .join('\n'),
      payload: {
        kind: 'newsletter_draft',
        surveyId: params.surveyId,
        surveyTitle: params.surveyTitle,
        subject: copy.subject,
        body,
        disclaimerApplied: disclaimer,
        finding: params.finding,
        channel: 'email',
      },
    });
    drafts.push({
      kind: 'newsletter',
      stagedActionId: staged.id,
      disclaimerApplied: disclaimer,
      bodyOrCaption: body,
    });
  }

  if (wantVideo) {
    const copy = await generateVideoScript({
      finding: params.finding,
      surveyTitle: params.surveyTitle,
      mockOutputs: mock,
    });
    const caption = bakeDisclaimerIntoText(copy.caption, disclaimer, 'caption');

    let videoUrl: string | null = null;
    let provider: string | null = null;
    if (!params.options?.skipVideoGenerate && !mock) {
      try {
        const job = await generateVideoUntilDone({
          userId: params.userId,
          prompt: copy.script,
          modelPrompt: copy.script,
          provider: 'mock', // AT2 drafts: mock keeps fire path offline-safe; keyed providers still available via studio
          mode: 't2v',
          aspectRatio: '9:16',
        });
        videoUrl = job.localAssetUrl || job.assetUrl || null;
        provider = job.provider;
      } catch (e) {
        console.warn(
          '[AT2] video generate failed; staging caption-only draft:',
          e instanceof Error ? e.message : e
        );
      }
    } else if (mock || params.options?.skipVideoGenerate) {
      // Same sample asset the mock provider returns — draft without waiting.
      videoUrl =
        'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4';
      provider = 'mock';
    }

    const staged = await ConsultantRepo.createStagedAction({
      conversationId: conversation.id,
      toolName: 'generate_and_post_video',
      summary: [
        `### Video draft — survey #${params.surveyId}`,
        videoUrl ? `Preview ready.` : 'Caption/script staged (video asset pending).',
        disclaimer ? '_Small-sample disclaimer included in caption._' : null,
        '',
        '**Not posted.** Approve on the card to proceed.',
      ]
        .filter(Boolean)
        .join('\n'),
      payload: {
        kind: 'video_draft',
        surveyId: params.surveyId,
        surveyTitle: params.surveyTitle,
        tool: 'generate_and_post_video',
        input: {
          script: copy.script,
          caption,
          platform: 'tiktok',
          videoUrl: videoUrl || undefined,
          provider: provider || 'mock',
          includeAiDisclosure: true,
        },
        videoUrl,
        caption,
        script: copy.script,
        disclaimerApplied: disclaimer,
        finding: params.finding,
        description: 'Auto-trigger video draft from survey finding',
      },
    });
    drafts.push({
      kind: 'video',
      stagedActionId: staged.id,
      disclaimerApplied: disclaimer,
      bodyOrCaption: caption,
      videoUrl,
    });
  }

  // Surface a short notice on the conversation transcript
  if (drafts.length) {
    const notice = [
      `### Auto-trigger drafts — survey #${params.surveyId}`,
      `Finding: ${params.finding.claim.slice(0, 200)}`,
      `Staged: ${drafts.map((d) => d.kind).join(', ')}`,
      disclaimer ? 'Small-sample disclaimer baked into copy.' : null,
      '',
      '_Nothing sends or posts until you Approve._',
    ]
      .filter(Boolean)
      .join('\n');
    const messages = [
      ...conversation.messages,
      {
        role: 'assistant' as const,
        content: notice,
        meta: {
          kind: 'staged_notice' as const,
          toolName: 'autotrigger_outputs',
          risk: 'approval' as const,
          stagedActionId: drafts[0].stagedActionId,
        },
        createdAt: new Date().toISOString(),
      },
    ];
    await ConsultantRepo.saveMessages(conversation.id, params.userId, messages);
  }

  return { finding: params.finding, drafts };
}
