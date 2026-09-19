/**
 * P2 decay blend: P = w·p0 + (1−w)·q  with w = exp(-k · e).
 */

import { computePriorP0 } from './prior';
import {
  accumulateEvidence,
  type EngagementEvent,
} from './evidence';
import { bucketTier, getDecayK, PROPENSITY_FORMULA_VERSION, type PropensityTier } from './config';
import type { PriorMapInputs, PriorResult, PropensityRead } from './types';

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  return Math.min(1, Math.max(0, n));
}

export type BlendResult = {
  p0: number;
  prior: PriorResult;
  evidenceE: number;
  priorWeight: number;
  posteriorQ: number | null;
  /** Blended propensity — the only decision-facing value. */
  propensity: number;
  confidence: number;
  tier: PropensityTier;
  decayK: number;
  formulaVersion: string;
  evidenceDetail: ReturnType<typeof accumulateEvidence>['events'];
};

/**
 * prior_weight w = exp(-k · e)
 * e=0 → w=1 (cold start); as e grows w→0 (live dominates).
 */
export function priorWeightFromEvidence(e: number, k = getDecayK()): number {
  const evidence = Math.max(0, e);
  const decay = Math.max(0.05, k);
  return clamp01(Math.exp(-decay * evidence));
}

/**
 * Full P2 blend from Map prior inputs + engagement events.
 */
export function computePropensityBlend(
  mapInputs: PriorMapInputs,
  events: EngagementEvent[],
  opts?: { decayK?: number; nowMs?: number }
): BlendResult {
  const prior = computePriorP0(mapInputs);
  const decayK = opts?.decayK ?? getDecayK();
  const { e, q, events: evidenceDetail } = accumulateEvidence(events, opts?.nowMs);
  const w = priorWeightFromEvidence(e, decayK);

  // No directional signal → propensity equals prior (live does not invent a q)
  let propensity: number;
  if (q == null) {
    propensity = prior.p0;
  } else {
    propensity = clamp01(w * prior.p0 + (1 - w) * q);
  }

  const confidence = clamp01(1 - w);

  return {
    p0: prior.p0,
    prior,
    evidenceE: e,
    priorWeight: w,
    posteriorQ: q,
    propensity,
    confidence,
    tier: bucketTier(propensity),
    decayK,
    formulaVersion: PROPENSITY_FORMULA_VERSION,
    evidenceDetail,
  };
}

/** Orchestrator read from a computed blend. */
export function propensityReadFromBlend(blend: BlendResult): PropensityRead {
  return {
    blended: blend.propensity,
    priorWeight: blend.priorWeight,
    prior: blend.prior,
    responseEvidenceCount: blend.evidenceDetail.length,
    phase: blend.posteriorQ == null && blend.evidenceE <= 0 ? 'p1_prior_only' : 'p2_blend',
    confidence: blend.confidence,
    posteriorQ: blend.posteriorQ,
    tier: blend.tier,
    evidenceE: blend.evidenceE,
  };
}

/**
 * Orchestrator-facing read. Decision code must use `blended` only.
 * Without events: blended === p0. With events: P2 decay blend.
 */
export function resolvePropensityForOrchestrator(
  inputs: PriorMapInputs,
  responseEvidenceCount = 0,
  events?: EngagementEvent[]
): PropensityRead {
  const evs =
    events ??
    (responseEvidenceCount > 0
      ? Array.from({ length: Math.min(responseEvidenceCount, 8) }, () => ({
          kind: 'survey_response' as const,
          sentiment01: 0.5,
        }))
      : []);

  return propensityReadFromBlend(computePropensityBlend(inputs, evs));
}
