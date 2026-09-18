import { createCompletion } from '@/app/utils/services/ai-service';
import { SurveyRepo } from '@/app/utils/database/survey-repo';
import { openSql } from '@/app/utils/database/db';
import {
  scanPostableInsights,
  type ComputedContrast,
} from '@/app/utils/services/postable-insight-service';
import { getDistrictDataTool } from '@/app/utils/services/tools/get-district-data';
import type { CampaignTool } from './types';

type Input = {
  surveyId: number;
  maxCandidates?: number;
};

type RankedCandidate = {
  rank: number;
  claim: string;
  honestCaveat: string;
  suggestedAngle: string;
  chartRef: string;
  publishable: true;
  nA: number;
  nB: number;
  effect: number;
  pCorrected: number;
  uncertaintyNote: string;
  groupingField: string;
  groupA: string;
  groupB: string;
  outcomePrompt: string;
  outcomeValue: string | null;
  contrastId: string;
};

function contrastStatsBlock(c: ComputedContrast): string {
  return [
    `id: ${c.id}`,
    `outcome: ${c.outcomePrompt}${c.outcomeValue ? ` [${c.outcomeValue}]` : ''}`,
    `groups: ${c.groupingField} = ${c.groupA} (n=${c.nA}, est=${c.estimateA.toFixed(3)}) vs ${c.groupB} (n=${c.nB}, est=${c.estimateB.toFixed(3)})`,
    `absoluteEffect: ${c.absoluteEffect.toFixed(4)}`,
    `relativeEffect: ${c.relativeEffect == null ? 'n/a' : c.relativeEffect.toFixed(4)}`,
    `p: ${c.pValue.toPrecision(4)} → pCorrected: ${c.pCorrected.toPrecision(4)}`,
    `uncertaintyNote: ${c.uncertaintyNote}`,
  ].join('\n');
}

async function maybeDistrictContext(
  surveyId: number,
  userId: number,
  organizationId?: number | null
): Promise<string | null> {
  try {
    let districtCode: string | null = null;
    const orgId = organizationId ?? null;
    if (orgId) {
      const db = await openSql();
      const [rows]: any = await db.execute(
        `SELECT district_code FROM organizations WHERE id = ? LIMIT 1`,
        [orgId]
      );
      districtCode = rows?.[0]?.district_code ? String(rows[0].district_code) : null;
    }
    if (!districtCode) {
      const survey = await SurveyRepo.getSurveyById(surveyId, userId);
      const blob = `${(survey as any)?.title || ''} ${(survey as any)?.description || ''}`;
      const m = blob.toUpperCase().match(/\b([A-Z]{2})\s*-?\s*(\d{1,2})\b/);
      if (m) districtCode = `${m[1]}-${parseInt(m[2], 10)}`;
    }
    if (!districtCode) return null;
    const district = await getDistrictDataTool.execute({ districtCode }, { userId });
    return district.summary;
  } catch {
    return null;
  }
}

async function rankWithClaude(params: {
  survivors: ComputedContrast[];
  maxCandidates: number;
  districtSummary: string | null;
  surveyTitle: string;
}): Promise<RankedCandidate[]> {
  const survivors = params.survivors.slice(0, 12);
  if (!survivors.length) return [];

  const prompt = `You rank statistically gated survey findings for public postability.

RULES (hard):
- You may ONLY use the survivors below. Do not invent numbers.
- Do not upgrade or include anything not in this list.
- Every claim must stay consistent with the provided n, effect, and pCorrected.
- Prefer surprising, on-message, and safe-to-say-publicly findings.
- Carry an honestCaveat that reflects the uncertaintyNote / sample limits.

Survey: ${params.surveyTitle}

District context (may be missing):
${params.districtSummary || '(none — judge postability from the stats alone)'}

Survivors (code-computed; already passed the statistical gate):
${survivors.map(contrastStatsBlock).join('\n---\n')}

Return ONLY JSON:
{
  "ranked": [
    {
      "contrastId": "c1",
      "claim": "one sentence public claim with exact numbers",
      "honestCaveat": "plain-English caveat",
      "suggestedAngle": "post/video angle",
      "chartRef": "short chart/reference label"
    }
  ]
}
Rank at most ${params.maxCandidates} items.`;

  const completion = await createCompletion({
    model: process.env.ANTHROPIC_API_KEY
      ? 'claude-sonnet-4-6'
      : process.env.OPENAI_API_KEY
        ? 'gpt-4o'
        : 'claude-sonnet-4-6',
    temperature: 0.3,
    maxTokens: 2500,
    messages: [
      {
        role: 'system',
        content:
          'You are a cautious campaign communications analyst. Statistics are ground truth; you only rank and phrase. Return JSON only.',
      },
      { role: 'user', content: prompt },
    ],
  });

  const byId = new Map(survivors.map((c) => [c.id, c]));
  let rankedRaw: any[] = [];
  try {
    const cleaned = (completion.content || '')
      .replace(/```json\s*/gi, '')
      .replace(/```/g, '')
      .trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : cleaned);
    rankedRaw = Array.isArray(parsed?.ranked) ? parsed.ranked : [];
  } catch {
    // Fallback: keep stats order, template phrasing
    return survivors.slice(0, params.maxCandidates).map((c, idx) => ({
      rank: idx + 1,
      claim: `${c.groupingField}: ${c.groupA} vs ${c.groupB} on "${c.outcomePrompt}"${
        c.outcomeValue ? ` (${c.outcomeValue})` : ''
      } — ${(c.estimateA * 100).toFixed(1)}% vs ${(c.estimateB * 100).toFixed(1)}% (n=${c.nA}/${c.nB}).`,
      honestCaveat: c.uncertaintyNote,
      suggestedAngle: 'Data callout with caveat and sample sizes visible',
      chartRef: `${c.groupingField}:${c.groupA}-vs-${c.groupB}`,
      publishable: true as const,
      nA: c.nA,
      nB: c.nB,
      effect: c.absoluteEffect,
      pCorrected: c.pCorrected,
      uncertaintyNote: c.uncertaintyNote,
      groupingField: c.groupingField,
      groupA: c.groupA,
      groupB: c.groupB,
      outcomePrompt: c.outcomePrompt,
      outcomeValue: c.outcomeValue,
      contrastId: c.id,
    }));
  }

  const out: RankedCandidate[] = [];
  for (const item of rankedRaw) {
    if (out.length >= params.maxCandidates) break;
    const id = String(item?.contrastId || '');
    const c = byId.get(id);
    if (!c || !c.publishable) continue;
    out.push({
      rank: out.length + 1,
      claim: String(item.claim || '').slice(0, 400),
      honestCaveat: String(item.honestCaveat || c.uncertaintyNote).slice(0, 400),
      suggestedAngle: String(item.suggestedAngle || '').slice(0, 240),
      chartRef: String(item.chartRef || c.id).slice(0, 120),
      publishable: true,
      nA: c.nA,
      nB: c.nB,
      effect: c.absoluteEffect,
      pCorrected: c.pCorrected,
      uncertaintyNote: c.uncertaintyNote,
      groupingField: c.groupingField,
      groupA: c.groupA,
      groupB: c.groupB,
      outcomePrompt: c.outcomePrompt,
      outcomeValue: c.outcomeValue,
      contrastId: c.id,
    });
  }

  // If model returned nothing usable, fall back to stats order
  if (!out.length) {
    return survivors.slice(0, params.maxCandidates).map((c, idx) => ({
      rank: idx + 1,
      claim: `${c.groupingField}: ${c.groupA} vs ${c.groupB} — effect ${(c.absoluteEffect * 100).toFixed(1)}pp (p=${c.pCorrected.toPrecision(3)}).`,
      honestCaveat: c.uncertaintyNote,
      suggestedAngle: 'Lead with the effect size and sample sizes',
      chartRef: c.id,
      publishable: true as const,
      nA: c.nA,
      nB: c.nB,
      effect: c.absoluteEffect,
      pCorrected: c.pCorrected,
      uncertaintyNote: c.uncertaintyNote,
      groupingField: c.groupingField,
      groupA: c.groupA,
      groupB: c.groupB,
      outcomePrompt: c.outcomePrompt,
      outcomeValue: c.outcomeValue,
      contrastId: c.id,
    }));
  }

  return out;
}

/**
 * Surface statistically gated findings worth turning into a post/video.
 * Posts nothing — auto-risk candidates only.
 */
export const findPostableInsightTool: CampaignTool<Input> = {
  name: 'find_postable_insight',
  description:
    'Surface 1–few survey findings that clear a hard statistical gate and are worth drafting into a post/video. Private; returns candidates only — does not post or send. Chain: run_analytics → find_postable_insight → draft_posts / generate_and_post_video (approval).',
  inputSchema: {
    type: 'object',
    properties: {
      surveyId: { type: 'number', description: 'Survey id to scan' },
      maxCandidates: {
        type: 'number',
        description: 'Max ranked publishable candidates to return (default 3)',
      },
    },
    required: ['surveyId'],
    additionalProperties: false,
  },
  risk: 'auto',
  async execute(input, ctx) {
    const surveyId = Number(input.surveyId);
    if (!Number.isFinite(surveyId) || surveyId <= 0) {
      throw new Error('surveyId must be a positive number');
    }
    const maxCandidates = Math.min(
      Math.max(Number(input.maxCandidates) || 3, 1),
      5
    );

    const survey = await SurveyRepo.getSurveyById(surveyId, ctx.userId);
    if (!survey) {
      throw new Error(`Survey ${surveyId} not found or not accessible.`);
    }

    const scan = await scanPostableInsights({
      surveyId,
      userId: ctx.userId,
    });

    const orgId =
      ctx.organizationId ?? (survey as { organization_id?: number | null }).organization_id ?? null;

    // H1: write gated (or directional-as-context) findings into situation snapshot
    try {
      const { writeBackAfterPostableInsight } = await import(
        '@/app/utils/services/situation-writeback-service'
      );
      await writeBackAfterPostableInsight({
        surveyId,
        userId: ctx.userId,
        orgId,
        publishable: scan.publishable,
        directionalOnly: scan.directionalOnly,
      });
    } catch (writeBackError) {
      console.warn(
        `[H1 write-back] find_postable_insight write-back failed (non-fatal) for survey ${surveyId}:`,
        writeBackError
      );
    }

    if (scan.insufficientData || scan.publishable.length === 0) {
      const msg =
        scan.insufficientDataMessage ||
        `${scan.totalResponses} responses — not enough to publish a subgroup claim yet.`;
      return {
        summary: [
          `### Postable insights — survey #${surveyId}`,
          msg,
          '',
          `Scanned ${scan.contrastsScanned} contrasts across fields: ${
            scan.groupingFieldsUsed.join(', ') || 'none'
          }.`,
          'Directional (not publishable) items are withheld from posting candidates.',
          '',
          'What would change that: more responses, larger subgroup cells, or a simpler contrast that clears min cell size / effect / significance.',
        ].join('\n'),
        data: {
          surveyId,
          totalResponses: scan.totalResponses,
          thresholds: scan.thresholds,
          contrastsScanned: scan.contrastsScanned,
          candidates: [],
          directionalOnlyCount: scan.directionalOnly.length,
          insufficientData: true,
        },
      };
    }

    const districtSummary = await maybeDistrictContext(
      surveyId,
      ctx.userId,
      orgId
    );

    const candidates = await rankWithClaude({
      survivors: scan.publishable,
      maxCandidates,
      districtSummary,
      surveyTitle: String((survey as any).title || `Survey ${surveyId}`),
    });

    return {
      summary: [
        `### Postable insights — survey #${surveyId}`,
        `Found ${scan.publishable.length} gate-clearing contrast(s); returning top ${candidates.length}.`,
        `Total responses: ${scan.totalResponses}. Contrasts scanned: ${scan.contrastsScanned}.`,
        '',
        ...candidates.map(
          (c) =>
            `${c.rank}. ${c.claim}\n   Caveat: ${c.honestCaveat}\n   Angle: ${c.suggestedAngle}\n   Stats: n=${c.nA}/${c.nB}, effect=${(c.effect * 100).toFixed(1)}pp, p=${c.pCorrected.toPrecision(3)}`
        ),
        '',
        'Next: pick one candidate → `draft_posts` (auto) and/or `generate_and_post_video` (approval before anything public).',
      ].join('\n'),
      data: {
        surveyId,
        totalResponses: scan.totalResponses,
        thresholds: scan.thresholds,
        contrastsScanned: scan.contrastsScanned,
        groupingFieldsUsed: scan.groupingFieldsUsed,
        candidates,
        directionalOnlyCount: scan.directionalOnly.length,
        insufficientData: false,
        districtContextAttached: Boolean(districtSummary),
      },
    };
  },
};
