/**
 * P3 unit checks — who-to-work ranking, tier filters, estimated vs confirmed.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/propensity/test-sales.ts
 */

import {
  sortWhoToWork,
  whoToWorkSortKey,
} from '../../src/app/utils/propensity/sales';
import {
  bucketTier,
  isConfirmedConfidence,
  CONFIDENCE_CONFIRMED_THRESHOLD,
  tierRank,
} from '../../src/app/utils/propensity/config';
import { filtersFromSegmentId, mergeFilters } from '../../src/app/utils/database/turf-repo';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function main() {
  assert(tierRank('hot') < tierRank('warm'), 'hot before warm');
  assert(tierRank('warm') < tierRank('cold'), 'warm before cold');
  assert(bucketTier(0.71) === 'hot', 'hot bucket');
  assert(!isConfirmedConfidence(0.1), 'low conf = estimated');
  assert(isConfirmedConfidence(CONFIDENCE_CONFIRMED_THRESHOLD), 'threshold = confirmed');

  const now = Date.now();
  const ranked = sortWhoToWork(
    [
      {
        tier: 'cold',
        propensity: 0.2,
        confidence: 0.1,
        freshnessMs: now,
        canvassStatus: 'not_contacted',
        id: 'cold-fresh',
      },
      {
        tier: 'hot',
        propensity: 0.85,
        confidence: 0.9,
        freshnessMs: now - 1000,
        canvassStatus: 'not_contacted',
        id: 'hot-fresh',
      },
      {
        tier: 'hot',
        propensity: 0.8,
        confidence: 0.2,
        freshnessMs: now - 48 * 3600 * 1000,
        canvassStatus: 'not_contacted',
        id: 'hot-stale',
      },
      {
        tier: 'hot',
        propensity: 0.9,
        confidence: 0.95,
        freshnessMs: now,
        canvassStatus: 'confirmed',
        id: 'hot-done',
      },
      {
        tier: 'warm',
        propensity: 0.55,
        confidence: 0.6,
        freshnessMs: now,
        canvassStatus: 'not_contacted',
        id: 'warm',
      },
    ],
    now
  );

  assert(ranked[0].id === 'hot-fresh', `first should be hot-fresh, got ${ranked[0].id}`);
  assert(ranked[1].id === 'hot-stale', `second hot-stale, got ${ranked[1].id}`);
  assert(ranked[2].id === 'warm', `third warm, got ${ranked[2].id}`);
  assert(ranked[3].id === 'cold-fresh', `fourth cold, got ${ranked[3].id}`);
  assert(ranked[4].id === 'hot-done', `confirmed sinks last, got ${ranked[4].id}`);

  // hot-fresh beats hot-stale
  assert(
    whoToWorkSortKey(ranked[0] as any, now) < whoToWorkSortKey(ranked[1] as any, now),
    'fresher hot sorts ahead of stale hot'
  );

  // Segment presets for sales language
  assert(
    filtersFromSegmentId('hot')?.propensityTier?.[0] === 'hot',
    'segment hot → propensityTier'
  );
  const merged = mergeFilters(filtersFromSegmentId('hot'), { party: ['Democrat'] });
  assert(merged.propensityTier?.[0] === 'hot', 'merge keeps tier');
  assert(merged.party?.[0] === 'Democrat', 'merge keeps party');

  console.log({
    order: ranked.map((r) => r.id),
    threshold: CONFIDENCE_CONFIRMED_THRESHOLD,
  });
  console.log('PASS: P3 sales — who-to-work, tiers, estimated/confirmed');
}

main();
