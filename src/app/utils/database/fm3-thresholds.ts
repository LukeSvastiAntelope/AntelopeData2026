/**
 * FM3 conservative match decision thresholds.
 * Shared by collation:fm3 and invariant tests — do not hardcode elsewhere.
 *
 *   score >= autoMergeMin → auto_merge
 *   score >= reviewMin    → review queue
 *   else                  → reject (leave separate)
 */

export const FM3_AUTO_MERGE_MIN_DEFAULT = 0.92;
export const FM3_REVIEW_MIN_DEFAULT = 0.78;

export type Fm3Thresholds = {
  autoMergeMin: number;
  reviewMin: number;
};

export type Fm3Decision = 'auto_merge' | 'review' | 'reject';

export function getFm3Thresholds(
  env: NodeJS.ProcessEnv = process.env
): Fm3Thresholds {
  const autoMergeMin = Number(env.FM3_AUTO_MERGE_MIN || FM3_AUTO_MERGE_MIN_DEFAULT);
  const reviewMin = Number(env.FM3_REVIEW_MIN || FM3_REVIEW_MIN_DEFAULT);
  return { autoMergeMin, reviewMin };
}

/** Validate reviewMin < autoMergeMin in (0, 1]. */
export function assertValidFm3Thresholds(t: Fm3Thresholds): void {
  if (!(t.autoMergeMin > t.reviewMin) || t.reviewMin < 0 || t.autoMergeMin > 1) {
    throw new Error(
      'Require 0 <= review-min < auto-min <= 1 (defaults 0.78 < 0.92)'
    );
  }
}

/**
 * Decision boundary for a scored pair — same branches as scripts/collation/fm3-decide.ts.
 */
export function decideFm3Match(
  score: number,
  thresholds: Fm3Thresholds = getFm3Thresholds()
): Fm3Decision {
  if (!Number.isFinite(score)) return 'reject';
  if (score >= thresholds.autoMergeMin) return 'auto_merge';
  if (score >= thresholds.reviewMin) return 'review';
  return 'reject';
}
