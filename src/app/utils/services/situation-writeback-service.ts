/**
 * H1 write-back: commit gated analytics / postable-insight findings into the
 * campaign_consultant situation snapshot. Conviction vs context is enforced here.
 */

import { randomUUID } from 'crypto';
import { openSql } from '@/app/utils/database/db';
import { SurveyRepo } from '@/app/utils/database/survey-repo';
import {
  AgentSituationService,
  type SituationFinding,
} from '@/app/utils/services/agent-situation-service';
import type { ComputedContrast } from '@/app/utils/services/postable-insight-service';

const MAX_FINDINGS = 40;

export type SampleProvenance = SituationFinding['sampleProvenance'];

function contrastToFinding(
  c: ComputedContrast,
  provenance: SampleProvenance,
  source: string,
  role: SituationFinding['role']
): SituationFinding {
  const claimBase = c.outcomeValue
    ? `"${c.outcomeValue}" on "${c.outcomePrompt}"`
    : `"${c.outcomePrompt}"`;
  const claim =
    role === 'conviction'
      ? `${c.groupingField}: ${c.groupA} vs ${c.groupB} — ${claimBase} (${(c.estimateA * 100).toFixed(1)}% vs ${(c.estimateB * 100).toFixed(1)}%, n=${c.nA}/${c.nB})`
      : `[directional] ${c.groupingField}: ${c.groupA} vs ${c.groupB} — ${claimBase}`;

  return {
    claim,
    confidence: {
      effect: c.absoluteEffect,
      pCorrected: c.pCorrected,
      nPerGroup: {
        groupA: c.groupA,
        nA: c.nA,
        groupB: c.groupB,
        nB: c.nB,
      },
    },
    sampleProvenance: provenance,
    source,
    timestamp: new Date().toISOString(),
    role,
  };
}

/**
 * Hard rule: only publishable contrasts become conviction.
 * directional_only → context only (never nextActions).
 */
export function findingsFromContrasts(params: {
  publishable: ComputedContrast[];
  directionalOnly?: ComputedContrast[];
  provenance: SampleProvenance;
  source: string;
  includeDirectionalAsContext?: boolean;
  maxDirectional?: number;
}): SituationFinding[] {
  const out: SituationFinding[] = [];

  for (const c of params.publishable) {
    if (!c.publishable || c.flag !== 'publishable') continue; // enforce in code
    out.push(contrastToFinding(c, params.provenance, params.source, 'conviction'));
  }

  if (params.includeDirectionalAsContext) {
    const maxD = params.maxDirectional ?? 5;
    for (const c of (params.directionalOnly || []).slice(0, maxD)) {
      out.push(contrastToFinding(c, params.provenance, params.source, 'context'));
    }
  }

  return out;
}

async function resolveOrgId(surveyId: number, preferredOrgId?: number | null): Promise<number | null> {
  if (preferredOrgId != null && Number.isFinite(Number(preferredOrgId)) && Number(preferredOrgId) > 0) {
    return Number(preferredOrgId);
  }
  try {
    const survey = await SurveyRepo.getSurveyByIdAny(surveyId);
    const orgId = (survey as any)?.organization_id;
    if (orgId != null && Number(orgId) > 0) return Number(orgId);
  } catch {
    /* ignore */
  }
  return null;
}

async function buildSampleProvenance(surveyId: number): Promise<SampleProvenance> {
  try {
    const db = await openSql();
    const [rows]: any = await db.execute(
      `SELECT source, COUNT(*) AS cnt
       FROM survey_responses
       WHERE survey_id = ?
       GROUP BY source`,
      [surveyId]
    );
    const channels = (rows || [])
      .map((r: any) => String(r.source || 'unknown'))
      .filter(Boolean);
    const samplingNote =
      channels.length === 0
        ? 'Response channels unknown; treat as self-selected survey traffic unless otherwise documented.'
        : `Response sources: ${channels.join(', ')}. Default assumption: self-selected respondents unless a probability sample is documented.`;
    return { surveyId, channels, samplingNote };
  } catch {
    return {
      surveyId,
      channels: [],
      samplingNote:
        'Could not inspect response sources; treat as self-selected survey traffic.',
    };
  }
}

/**
 * Append structured findings to the consultant situation snapshot.
 * Never throws to callers — write-back must not break analytics.
 */
export async function commitFindingsToSituation(params: {
  surveyId: number;
  orgId?: number | null;
  userId?: number | null;
  findings: SituationFinding[];
  traceId?: string;
  changeSummary?: string;
}): Promise<{ committed: boolean; version?: number; reason?: string }> {
  try {
    if (!params.findings.length) {
      return { committed: false, reason: 'no_findings' };
    }

    // Enforce role rules again at the commit boundary
    const safeFindings = params.findings.filter((f) => {
      if (f.role === 'conviction') {
        // Conviction requires confidence stats
        return (
          Number.isFinite(f.confidence?.effect) &&
          Number.isFinite(f.confidence?.pCorrected) &&
          Number.isFinite(f.confidence?.nPerGroup?.nA) &&
          Number.isFinite(f.confidence?.nPerGroup?.nB)
        );
      }
      return f.role === 'context';
    });
    if (!safeFindings.length) {
      return { committed: false, reason: 'no_safe_findings' };
    }

    const orgId = await resolveOrgId(params.surveyId, params.orgId);
    if (!orgId) {
      console.warn(
        `[situation-writeback] Skipping commit for survey ${params.surveyId}: no organization_id`
      );
      return { committed: false, reason: 'no_org' };
    }

    const current = await AgentSituationService.getCurrent(orgId, 'campaign_consultant');
    const existing = Array.isArray(current.snapshot.findings) ? current.snapshot.findings : [];
    const mergedFindings = [...existing, ...safeFindings]
      .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))
      .slice(0, MAX_FINDINGS);

    const convictions = safeFindings.filter((f) => f.role === 'conviction');
    const contexts = safeFindings.filter((f) => f.role === 'context');

    // Surface convictions as opportunities / evidence; never promote context into nextActions
    const opportunityLines = convictions.map((f) => f.claim);
    const evidenceLines = convictions.map(
      (f) =>
        `${f.source}: effect=${f.confidence.effect.toFixed(3)} p=${f.confidence.pCorrected.toPrecision(3)} n=${f.confidence.nPerGroup.nA}/${f.confidence.nPerGroup.nB}`
    );
    const contextLines = contexts.map((f) => f.claim);

    const summaryBits = [
      convictions.length
        ? `Committed ${convictions.length} gated conviction finding(s) from survey ${params.surveyId}.`
        : null,
      contexts.length
        ? `Logged ${contexts.length} directional-only finding(s) as low-confidence context (not actionable).`
        : null,
    ].filter(Boolean);

    const doc = await AgentSituationService.commitUpdate({
      orgId,
      agentId: 'campaign_consultant',
      changedByAgent: 'campaign_consultant',
      traceId: params.traceId || `analytics-${params.surveyId}-${randomUUID().slice(0, 8)}`,
      changeSummary:
        params.changeSummary ||
        `H1 write-back: survey ${params.surveyId} (${convictions.length} conviction, ${contexts.length} context)`,
      patch: {
        summary: summaryBits.join(' ') || current.snapshot.summary,
        findings: mergedFindings,
        opportunities: opportunityLines.length
          ? [...opportunityLines, ...(current.snapshot.opportunities || [])]
          : undefined,
        evidenceRefs: evidenceLines.length
          ? [...evidenceLines, ...(current.snapshot.evidenceRefs || [])]
          : undefined,
        // Directional context may inform openQuestions but never nextActions
        openQuestions: contextLines.length
          ? [
              ...contextLines.map((c) => `Validate before acting: ${c}`),
              ...(current.snapshot.openQuestions || []),
            ]
          : undefined,
      },
    });

    return { committed: true, version: doc.version };
  } catch (error) {
    console.error('[situation-writeback] commit failed (non-fatal):', error);
    return {
      committed: false,
      reason: error instanceof Error ? error.message : 'commit_failed',
    };
  }
}

/**
 * After analytics completes: prefer gated postable-insight contrasts;
 * degrade gracefully if the scanner is unavailable.
 */
export async function writeBackAfterAnalytics(params: {
  surveyId: number;
  userId?: number | null;
  orgId?: number | null;
  traceId?: string;
}): Promise<{ committed: boolean; reason?: string }> {
  const provenance = await buildSampleProvenance(params.surveyId);

  // Prefer live statistical gate when available
  try {
    const { scanPostableInsights } = await import(
      '@/app/utils/services/postable-insight-service'
    );
    let userId = params.userId;
    if (!userId) {
      const survey = await SurveyRepo.getSurveyByIdAny(params.surveyId);
      userId = survey ? Number((survey as any).created_by) : null;
    }
    if (userId) {
      const scan = await scanPostableInsights({
        surveyId: params.surveyId,
        userId: Number(userId),
      });
      const findings = findingsFromContrasts({
        publishable: scan.publishable,
        directionalOnly: scan.directionalOnly,
        provenance,
        source: 'find_postable_insight',
        includeDirectionalAsContext: true,
        maxDirectional: 3,
      });
      if (findings.length) {
        return commitFindingsToSituation({
          surveyId: params.surveyId,
          orgId: params.orgId,
          userId,
          findings,
          traceId: params.traceId,
          changeSummary: `Analytics write-back via gated contrasts (survey ${params.surveyId})`,
        });
      }
      // Gate found nothing — honest context only
      return commitFindingsToSituation({
        surveyId: params.surveyId,
        orgId: params.orgId,
        userId,
        findings: [
          {
            claim:
              scan.insufficientDataMessage ||
              `Analytics completed for survey ${params.surveyId}; no subgroup contrast cleared the significance gate.`,
            confidence: {
              effect: 0,
              pCorrected: 1,
              nPerGroup: { groupA: 'n/a', nA: 0, groupB: 'n/a', nB: 0 },
            },
            sampleProvenance: provenance,
            source: 'ai_analytics',
            timestamp: new Date().toISOString(),
            role: 'context',
          },
        ],
        traceId: params.traceId,
        changeSummary: `Analytics completed — no publishable contrasts (survey ${params.surveyId})`,
      });
    }
  } catch (error) {
    console.warn(
      '[situation-writeback] postable-insight scan unavailable; falling back to analytics context note:',
      error
    );
  }

  // Fallback: no gated conviction without the filter
  return commitFindingsToSituation({
    surveyId: params.surveyId,
    orgId: params.orgId,
    userId: params.userId,
    findings: [
      {
        claim: `Analytics run completed for survey ${params.surveyId}. No significance-gated finding available to commit as conviction.`,
        confidence: {
          effect: 0,
          pCorrected: 1,
          nPerGroup: { groupA: 'n/a', nA: 0, groupB: 'n/a', nB: 0 },
        },
        sampleProvenance: provenance,
        source: 'ai_analytics',
        timestamp: new Date().toISOString(),
        role: 'context',
      },
    ],
    traceId: params.traceId,
    changeSummary: `Analytics fallback context write-back (survey ${params.surveyId})`,
  });
}

/**
 * After find_postable_insight: commit ranked publishable as conviction;
 * optional directional as context. Empty gate → honest context note.
 */
export async function writeBackAfterPostableInsight(params: {
  surveyId: number;
  userId: number;
  orgId?: number | null;
  publishable: ComputedContrast[];
  directionalOnly?: ComputedContrast[];
  traceId?: string;
}): Promise<{ committed: boolean; reason?: string }> {
  const provenance = await buildSampleProvenance(params.surveyId);
  const findings = findingsFromContrasts({
    publishable: params.publishable,
    directionalOnly: params.directionalOnly,
    provenance,
    source: 'find_postable_insight',
    includeDirectionalAsContext: true,
    maxDirectional: 3,
  });

  if (!findings.length) {
    return commitFindingsToSituation({
      surveyId: params.surveyId,
      orgId: params.orgId,
      userId: params.userId,
      findings: [
        {
          claim: `Postable-insight scan for survey ${params.surveyId} found no subgroup contrast that cleared the significance gate.`,
          confidence: {
            effect: 0,
            pCorrected: 1,
            nPerGroup: { groupA: 'n/a', nA: 0, groupB: 'n/a', nB: 0 },
          },
          sampleProvenance: provenance,
          source: 'find_postable_insight',
          timestamp: new Date().toISOString(),
          role: 'context',
        },
      ],
      traceId: params.traceId,
      changeSummary: `Postable-insight — no gated findings (survey ${params.surveyId})`,
    });
  }

  return commitFindingsToSituation({
    surveyId: params.surveyId,
    orgId: params.orgId,
    userId: params.userId,
    findings,
    traceId: params.traceId,
    changeSummary: `Postable-insight write-back (survey ${params.surveyId})`,
  });
}
