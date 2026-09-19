/**
 * P2 propensity config — the only real design dial is decay rate k.
 * w = exp(-k · e); larger k → responses override the prior faster.
 */

export const PROPENSITY_FORMULA_VERSION = 'p2.blend.v1';

/** Default decay rate. One door-confirm (e≈3) → w≈exp(-2.55)≈0.08. */
export const DEFAULT_DECAY_K = 0.85;

export function getDecayK(): number {
  const raw = process.env.PROPENSITY_DECAY_K;
  if (raw == null || raw === '') return DEFAULT_DECAY_K;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_DECAY_K;
  return Math.min(5, Math.max(0.05, n));
}

export type PropensityTier = 'hot' | 'warm' | 'cold';

export function bucketTier(P: number): PropensityTier {
  if (P >= 0.7) return 'hot';
  if (P >= 0.4) return 'warm';
  return 'cold';
}
