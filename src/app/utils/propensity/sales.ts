/**
 * P3 sales surface — who-to-work ranking (tier × freshness).
 * Pure helpers so UI / SQL stay aligned.
 */

import { tierRank, type PropensityTier } from './config';

export type WhoToWorkInput = {
  tier: PropensityTier | string;
  /** Blended propensity P ∈ [0,1] */
  propensity: number;
  /** confidence = 1 − w */
  confidence: number;
  /** ms since epoch of last evidence / recompute; higher = fresher */
  freshnessMs: number;
  /** Optional: already canvassed confirmed → deprioritize for "next" */
  canvassStatus?: string | null;
};

/**
 * Composite sort key: lower = work sooner.
 * Primary: tier (hot → warm → cold)
 * Secondary: fresher evidence first (negate freshness)
 * Tertiary: higher P first (negate propensity)
 * Quaternary: confirmed (high conf) slightly ahead of estimated within same bucket
 */
export function whoToWorkSortKey(row: WhoToWorkInput, nowMs = Date.now()): number {
  const tier = tierRank(row.tier) * 1e12;
  const ageHours = Math.max(0, (nowMs - (row.freshnessMs || 0)) / (1000 * 60 * 60));
  // Cap age contribution; fresher → smaller key
  const freshness = Math.min(ageHours, 24 * 90) * 1e6;
  const propensity = (1 - Math.min(1, Math.max(0, row.propensity))) * 1e3;
  const conf = (1 - Math.min(1, Math.max(0, row.confidence))) * 10;
  let contactedBump = 0;
  const status = (row.canvassStatus || '').toLowerCase();
  if (status === 'confirmed' || status === 'refused' || status === 'moved') {
    contactedBump = 5e12; // after all open tiers (cold = 2e12)
  }
  return tier + freshness + propensity + conf + contactedBump;
}

export function sortWhoToWork<T extends WhoToWorkInput>(rows: T[], nowMs = Date.now()): T[] {
  return [...rows].sort(
    (a, b) => whoToWorkSortKey(a, nowMs) - whoToWorkSortKey(b, nowMs)
  );
}
