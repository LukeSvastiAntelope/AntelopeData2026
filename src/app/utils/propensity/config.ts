/**
 * P2/P3 propensity config — decay rate k is the only blend dial;
 * confidence threshold separates estimated vs confirmed in the sales UI.
 */

export const PROPENSITY_FORMULA_VERSION = 'p2.blend.v1';

/** Default decay rate. One door-confirm (e≈3) → w≈exp(-2.55)≈0.08. */
export const DEFAULT_DECAY_K = 0.85;

/**
 * Confidence at/above this → "confirmed" styling (live engagement dominates).
 * Below → "estimated" (prior still carries weight).
 */
export const CONFIDENCE_CONFIRMED_THRESHOLD = 0.55;

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

/** hot=0, warm=1, cold=2 — lower is higher priority for who-to-work. */
export function tierRank(tier: PropensityTier | string): number {
  switch (tier) {
    case 'hot':
      return 0;
    case 'warm':
      return 1;
    case 'cold':
      return 2;
    default:
      return 9;
  }
}

export function isConfirmedConfidence(confidence: number): boolean {
  return Number.isFinite(confidence) && confidence >= CONFIDENCE_CONFIRMED_THRESHOLD;
}
