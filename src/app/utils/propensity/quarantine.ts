/**
 * P4 — Orchestrator quarantine helpers.
 *
 * Decision paths may only see PropensityOrchestratorView (blended + tier).
 * Raw prior p0 stays in PropensityRead / audit surfaces — never in tool ctx payloads.
 */

import {
  isConfirmedConfidence,
  type PropensityTier,
} from './config';
import type { PropensityOrchestratorView, PropensityRead } from './types';

const RAW_PRIOR_KEYS = new Set([
  'p0',
  'priorP0',
  'prior_p0',
  'prior',
  'priorFormula',
  'prior_formula',
]);

/**
 * Project a full PropensityRead (or row-like) into the quarantine view.
 * Never copies prior / p0.
 */
export function toOrchestratorPropensity(read: {
  blended: number;
  priorWeight: number;
  phase?: string;
  confidence?: number;
  tier?: PropensityTier | string | null;
  evidenceE?: number;
  responseEvidenceCount?: number;
}): PropensityOrchestratorView {
  const priorWeight = Number.isFinite(read.priorWeight) ? read.priorWeight : 1;
  const confidence =
    read.confidence != null && Number.isFinite(read.confidence)
      ? read.confidence
      : Math.max(0, Math.min(1, 1 - priorWeight));
  const tier = (read.tier as PropensityTier) || 'warm';
  const phase =
    (read.phase as PropensityOrchestratorView['phase']) ||
    (confidence > 0 || (read.evidenceE ?? 0) > 0 || (read.responseEvidenceCount ?? 0) > 0
      ? 'p2_blend'
      : 'p1_prior_only');

  return {
    blended: read.blended,
    value: read.blended,
    tier,
    priorWeight,
    confidence,
    signal: isConfirmedConfidence(confidence) ? 'confirmed' : 'estimated',
    phase: phase === 'p1_prior_only' ? 'p1_prior_only' : phase === 'p3_funnel' ? 'p3_funnel' : 'p4_tier',
  };
}

export function orchestratorViewFromRead(read: PropensityRead): PropensityOrchestratorView {
  return toOrchestratorPropensity({
    blended: read.blended,
    priorWeight: read.priorWeight,
    phase: read.phase,
    confidence: read.confidence,
    tier: read.tier,
    evidenceE: read.evidenceE,
    responseEvidenceCount: read.responseEvidenceCount,
  });
}

/**
 * Deep-strip raw prior keys from a tool/decision payload.
 * Idempotent; leaves blended / tier / confidence intact.
 */
export function stripRawPriorFromPayload<T>(value: T): T {
  return stripInner(value) as T;
}

function stripInner(value: unknown): unknown {
  if (value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(stripInner);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (RAW_PRIOR_KEYS.has(k)) continue;
    out[k] = stripInner(v);
  }
  return out;
}

/** Tripwire: throw if a decision payload still carries raw prior. */
export function assertNoRawPriorInDecision(payload: unknown, label = 'decision'): void {
  const found = findRawPriorKeys(payload);
  if (found.length) {
    throw new Error(
      `[propensity quarantine] ${label} must not expose raw prior; found: ${found.join(', ')}`
    );
  }
}

function findRawPriorKeys(value: unknown, path = ''): string[] {
  if (value == null || typeof value !== 'object') return [];
  if (Array.isArray(value)) {
    return value.flatMap((v, i) => findRawPriorKeys(v, `${path}[${i}]`));
  }
  const hits: string[] = [];
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const p = path ? `${path}.${k}` : k;
    if (RAW_PRIOR_KEYS.has(k)) hits.push(p);
    else hits.push(...findRawPriorKeys(v, p));
  }
  return hits;
}

/**
 * Structural check: object must look like PropensityOrchestratorView
 * (has blended + tier, lacks p0/prior).
 */
export function isOrchestratorPropensityView(value: unknown): value is PropensityOrchestratorView {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  if (typeof o.blended !== 'number') return false;
  if (typeof o.tier !== 'string') return false;
  if ('p0' in o || 'priorP0' in o || 'prior' in o) return false;
  return true;
}
