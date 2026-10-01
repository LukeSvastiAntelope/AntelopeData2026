/**
 * Analysis → content drafts (chart post, explainer video, candidate clip).
 * Numbers come from synthesis/stats/figures — Claude only phrases claims.
 * Metered as analytics.to_content (workhorse).
 */

import { createCompletion } from '@/app/utils/services/ai-service';
import { SMALL_SAMPLE_DISCLAIMER } from '@/app/utils/services/autotrigger-outputs';
import { POSTABLE_INSIGHT_THRESHOLDS } from '@/app/utils/services/postable-insight-service';
import {
  AnalyticsContentDraftRepo,
  type AnalyticsContentDraftRow,
  type AnalyticsDraftFlag,
} from '@/app/utils/database/analytics-content-draft-repo';

export type AnalysisFigureInput = {
  storageKey?: string | null;
  mediaUrl?: string | null;
  caption?: string | null;
  stepId?: string | null;
  n?: number | null;
  src?: string | null;
};

export type AnalysisContentInput = {
  userId: number;
  organizationId?: number | null;
  conversationId?: string | null;
  surveyId?: number | null;
  surveyTitle?: string | null;
  synthesis: string;
  figures: AnalysisFigureInput[];
  /** Optional stats from the run */
  sampleN?: number | null;
  testName?: string | null;
  pValue?: number | null;
};

export type ContentDraftBundle = {
  claim: string;
  honestCaveat: string;
  suggestedAngle: string;
  flag: AnalyticsDraftFlag;
  chartPost: {
    title: string;
    caption: string;
    figureIndex: number;
  };
  explainerVideo: {
    title: string;
    hook: string;
    findingBeat: string;
    meaningBeat: string;
    cta: string;
    storyboard: string[];
    script: string;
    durationSeconds: number;
  };
  candidateClip: {
    title: string;
    talkingPoints: string[];
    script: string;
    pressBlurb: string;
    durationSeconds: number;
  };
};

function buildSourceLine(
  surveyTitle: string | null | undefined,
  n: number | null | undefined
): string {
  const month = new Date().toLocaleString('en-US', {
    month: 'short',
    year: 'numeric',
  });
  return [surveyTitle?.trim() || 'Survey', n != null && n > 0 ? `N=${n}` : null, month]
    .filter(Boolean)
    .join(', ');
}

function inferFlag(params: {
  sampleN?: number | null;
  pValue?: number | null;
  synthesis: string;
}): AnalyticsDraftFlag {
  const n = params.sampleN;
  if (
    n != null &&
    (n < POSTABLE_INSIGHT_THRESHOLDS.minCellSize ||
      n < POSTABLE_INSIGHT_THRESHOLDS.minTotalResponses)
  ) {
    return 'directional_only';
  }
  if (params.pValue != null && params.pValue > POSTABLE_INSIGHT_THRESHOLDS.alpha) {
    return 'directional_only';
  }
  const syn = params.synthesis.toLowerCase();
  if (
    syn.includes('directional') ||
    syn.includes('small sample') ||
    syn.includes('not significant') ||
    syn.includes('limited n')
  ) {
    return 'directional_only';
  }
  // Without a hard statistical gate survivor, treat as directional unless n is healthy
  if (n != null && n >= POSTABLE_INSIGHT_THRESHOLDS.minTotalResponses) {
    return 'publishable';
  }
  return 'directional_only';
}

function fallbackBundle(
  input: AnalysisContentInput,
  flag: AnalyticsDraftFlag
): ContentDraftBundle {
  const claim =
    input.synthesis
      .replace(/^FINAL SYNTHESIS:\s*/i, '')
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.length > 20)?.slice(0, 280) ||
    'Key finding from this survey analysis';
  const caveat =
    flag === 'directional_only'
      ? SMALL_SAMPLE_DISCLAIMER
      : `Based on ${input.sampleN != null ? `N=${input.sampleN}` : 'this sample'}; interpret with normal sampling uncertainty.`;
  const angle =
    flag === 'publishable'
      ? 'Lead with the chart and one clear number'
      : 'Frame as directional learning with caveat visible';

  return {
    claim,
    honestCaveat: caveat,
    suggestedAngle: angle,
    flag,
    chartPost: {
      title: 'Chart post',
      caption: claim,
      figureIndex: 0,
    },
    explainerVideo: {
      title: 'Short explainer video',
      hook: 'Here is what voters just told us.',
      findingBeat: claim,
      meaningBeat: 'Here is what that means for our campaign.',
      cta: 'Share this with your neighbors — and join us.',
      storyboard: [
        'Hook b-roll (generative)',
        'Data beat: real chart card on screen',
        'Meaning: candidate/narrator',
        'CTA b-roll (generative)',
      ],
      script: [
        'Hook: Here is what voters just told us.',
        `Finding: ${claim}`,
        'What it means: Here is what that means for our campaign.',
        'CTA: Share this with your neighbors — and join us.',
      ].join('\n'),
      durationSeconds: 25,
    },
    candidateClip: {
      title: 'Candidate clip + press blurb',
      talkingPoints: [
        'Open with the finding in one sentence.',
        'Name the sample size and caveat honestly.',
        'Close with a concrete next step for voters.',
      ],
      script: [
        `(Camera, 30–45s)`,
        `Opening: ${claim}`,
        `Caveat: ${caveat}`,
        `Close: That is why we are focused on this — and why I need you with us.`,
      ].join('\n'),
      pressBlurb: `${claim} ${caveat}`.slice(0, 420),
      durationSeconds: 40,
    },
  };
}

async function draftWithModel(
  input: AnalysisContentInput,
  flag: AnalyticsDraftFlag
): Promise<ContentDraftBundle> {
  const figureNotes = input.figures
    .slice(0, 6)
    .map(
      (f, i) =>
        `${i}: ${f.caption || f.stepId || 'chart'}${f.storageKey ? ` [key=${f.storageKey}]` : ''}`
    )
    .join('\n');

  const prompt = `You turn a completed survey analysis into THREE content drafts for a campaign.

HARD RULES:
- Use ONLY facts present in the synthesis / stats. Never invent percentages, n, or p-values.
- flag is already decided as "${flag}". If directional_only, claims must sound directional and include an honestCaveat.
- chartRef/figureIndex must point at an existing figure index (0-based) from the list.
- Video data beat must use the real chart (not generative numbers).

Survey: ${input.surveyTitle || '(untitled)'}
Sample N: ${input.sampleN ?? 'unknown'}
Test: ${input.testName || 'n/a'}
p: ${input.pValue ?? 'n/a'}
Flag: ${flag}

Synthesis:
${(input.synthesis || '').slice(0, 6000)}

Figures:
${figureNotes || '(none)'}

Return ONLY JSON:
{
  "claim": "one-sentence finding",
  "honestCaveat": "plain-English caveat",
  "suggestedAngle": "short angle",
  "chartPost": { "title": "...", "caption": "...", "figureIndex": 0 },
  "explainerVideo": {
    "title": "...",
    "hook": "...",
    "findingBeat": "...",
    "meaningBeat": "...",
    "cta": "...",
    "storyboard": ["...", "..."],
    "script": "full 15-30s script",
    "durationSeconds": 25
  },
  "candidateClip": {
    "title": "...",
    "talkingPoints": ["...", "...", "..."],
    "script": "30-45s to-camera script",
    "pressBlurb": "3-sentence press/newsletter blurb",
    "durationSeconds": 40
  }
}`;

  const completion = await createCompletion({
    tier: 'workhorse',
    temperature: 0.35,
    maxTokens: 3500,
    expandOnTruncation: true,
    messages: [
      {
        role: 'system',
        content:
          'You are a campaign content strategist. Statistics in the user message are ground truth. Return JSON only.',
      },
      { role: 'user', content: prompt },
    ],
  });

  if (completion.stopReason === 'max_tokens') {
    console.warn('[analysis-content] truncated; using fallback bundle');
    return fallbackBundle(input, flag);
  }

  try {
    const cleaned = (completion.content || '')
      .replace(/```json\s*/gi, '')
      .replace(/```/g, '')
      .trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : cleaned);
    const base = fallbackBundle(input, flag);
    const figureIndex = Math.max(
      0,
      Math.min(
        Number(parsed?.chartPost?.figureIndex ?? 0) || 0,
        Math.max(0, input.figures.length - 1)
      )
    );
    return {
      claim: String(parsed.claim || base.claim).slice(0, 400),
      honestCaveat: String(
        parsed.honestCaveat ||
          (flag === 'directional_only' ? SMALL_SAMPLE_DISCLAIMER : base.honestCaveat)
      ).slice(0, 500),
      suggestedAngle: String(parsed.suggestedAngle || base.suggestedAngle).slice(
        0,
        240
      ),
      flag,
      chartPost: {
        title: String(parsed.chartPost?.title || 'Chart post').slice(0, 120),
        caption: String(parsed.chartPost?.caption || parsed.claim || base.claim).slice(
          0,
          600
        ),
        figureIndex,
      },
      explainerVideo: {
        title: String(parsed.explainerVideo?.title || base.explainerVideo.title).slice(
          0,
          120
        ),
        hook: String(parsed.explainerVideo?.hook || base.explainerVideo.hook).slice(
          0,
          240
        ),
        findingBeat: String(
          parsed.explainerVideo?.findingBeat || base.explainerVideo.findingBeat
        ).slice(0, 400),
        meaningBeat: String(
          parsed.explainerVideo?.meaningBeat || base.explainerVideo.meaningBeat
        ).slice(0, 400),
        cta: String(parsed.explainerVideo?.cta || base.explainerVideo.cta).slice(0, 240),
        storyboard: Array.isArray(parsed.explainerVideo?.storyboard)
          ? parsed.explainerVideo.storyboard.map((s: unknown) => String(s).slice(0, 160))
          : base.explainerVideo.storyboard,
        script: String(
          parsed.explainerVideo?.script || base.explainerVideo.script
        ).slice(0, 2000),
        durationSeconds: Math.min(
          30,
          Math.max(15, Number(parsed.explainerVideo?.durationSeconds) || 25)
        ),
      },
      candidateClip: {
        title: String(
          parsed.candidateClip?.title || base.candidateClip.title
        ).slice(0, 120),
        talkingPoints: Array.isArray(parsed.candidateClip?.talkingPoints)
          ? parsed.candidateClip.talkingPoints.map((s: unknown) =>
              String(s).slice(0, 200)
            )
          : base.candidateClip.talkingPoints,
        script: String(
          parsed.candidateClip?.script || base.candidateClip.script
        ).slice(0, 2000),
        pressBlurb: String(
          parsed.candidateClip?.pressBlurb || base.candidateClip.pressBlurb
        ).slice(0, 600),
        durationSeconds: Math.min(
          45,
          Math.max(30, Number(parsed.candidateClip?.durationSeconds) || 40)
        ),
      },
    };
  } catch {
    return fallbackBundle(input, flag);
  }
}

export async function generateAnalysisContentDrafts(
  input: AnalysisContentInput
): Promise<{
  bundle: ContentDraftBundle;
  drafts: AnalyticsContentDraftRow[];
}> {
  const flag = inferFlag({
    sampleN: input.sampleN,
    pValue: input.pValue,
    synthesis: input.synthesis,
  });
  const bundle = await draftWithModel(input, flag);
  const sourceLine = buildSourceLine(input.surveyTitle, input.sampleN);
  const figure =
    input.figures[bundle.chartPost.figureIndex] || input.figures[0] || null;

  const shared = {
    userId: input.userId,
    organizationId: input.organizationId ?? null,
    conversationId: input.conversationId ?? null,
    surveyId: input.surveyId ?? null,
    claim: bundle.claim,
    honestCaveat: bundle.honestCaveat,
    suggestedAngle: bundle.suggestedAngle,
    flag: bundle.flag,
    figureStorageKey: figure?.storageKey ?? null,
    figureMediaUrl: figure?.mediaUrl ?? null,
    figureCaption: figure?.caption ?? null,
    sampleN: input.sampleN ?? figure?.n ?? null,
    sourceLine,
  };

  const drafts: AnalyticsContentDraftRow[] = [];

  drafts.push(
    await AnalyticsContentDraftRepo.create({
      ...shared,
      draftKind: 'chart_post',
      title: bundle.chartPost.title,
      caption: bundle.chartPost.caption,
      payload: {
        kind: 'chart_post',
        figureIndex: bundle.chartPost.figureIndex,
        openComposer: true,
      },
    })
  );

  drafts.push(
    await AnalyticsContentDraftRepo.create({
      ...shared,
      draftKind: 'explainer_video',
      title: bundle.explainerVideo.title,
      caption: bundle.explainerVideo.cta,
      scriptJson: {
        hook: bundle.explainerVideo.hook,
        findingBeat: bundle.explainerVideo.findingBeat,
        meaningBeat: bundle.explainerVideo.meaningBeat,
        cta: bundle.explainerVideo.cta,
        storyboard: bundle.explainerVideo.storyboard,
        script: bundle.explainerVideo.script,
        durationSeconds: bundle.explainerVideo.durationSeconds,
        dataBeatUsesRealChart: true,
      },
      payload: {
        kind: 'explainer_video',
        openVideoStudio: true,
      },
    })
  );

  drafts.push(
    await AnalyticsContentDraftRepo.create({
      ...shared,
      draftKind: 'candidate_clip',
      title: bundle.candidateClip.title,
      caption: bundle.candidateClip.pressBlurb,
      blurb: bundle.candidateClip.pressBlurb,
      scriptJson: {
        talkingPoints: bundle.candidateClip.talkingPoints,
        script: bundle.candidateClip.script,
        durationSeconds: bundle.candidateClip.durationSeconds,
      },
      payload: {
        kind: 'candidate_clip',
        openClipStudio: true,
      },
    })
  );

  return { bundle, drafts };
}
