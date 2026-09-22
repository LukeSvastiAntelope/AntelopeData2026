/**
 * Autotrigger fire-once invariants (band math + idempotent claim).
 *
 *   npx tsx --tsconfig tsconfig.json scripts/analytics/test-autotrigger-fire-once.ts
 */

import {
  autotriggerResponseBand,
  claimFireOnceInMemory,
  tryClaimFireBand,
  type InMemoryBandClaimStore,
} from '../../src/app/utils/database/survey-autotrigger-repo';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function main() {
  const threshold = 25;

  // --- Band math: floor(count/threshold) ---
  assert(autotriggerResponseBand(24, threshold) === 0, 'below threshold → band 0');
  assert(autotriggerResponseBand(25, threshold) === 1, '25 → band 1');
  assert(autotriggerResponseBand(49, threshold) === 1, '49 → still band 1');
  assert(autotriggerResponseBand(50, threshold) === 2, '50 → band 2');
  assert(autotriggerResponseBand(74, threshold) === 2, '74 → band 2');
  assert(autotriggerResponseBand(75, threshold) === 3, '75 → band 3');

  // Same band does not claim again
  const sameBand = tryClaimFireBand({
    responseCount: 40,
    threshold,
    lastFiredResponseCount: 25,
  });
  assert(!sameBand.ok && sameBand.reason === 'already_fired_this_band', 'same band blocked');

  // Crossing into next band claims
  const next = tryClaimFireBand({
    responseCount: 50,
    threshold,
    lastFiredResponseCount: 25,
  });
  assert(next.ok && next.band === 2, `cross band → claim band 2, got ${JSON.stringify(next)}`);

  // Below threshold
  const below = tryClaimFireBand({
    responseCount: 10,
    threshold,
    lastFiredResponseCount: 0,
  });
  assert(!below.ok && below.reason === 'below_threshold', 'below threshold');

  // --- Idempotent claim via in-memory store (no live DB) ---
  const store: InMemoryBandClaimStore = { lastFiredResponseCount: 0 };

  const first = claimFireOnceInMemory(store, 30, threshold);
  assert(first.ok && first.band === 1, 'first fire in band 1');
  assert(store.lastFiredResponseCount === 30, 'store advanced');

  const second = claimFireOnceInMemory(store, 40, threshold);
  assert(
    !second.ok && second.reason === 'already_fired_this_band',
    `second same band → already_fired_this_band, got ${JSON.stringify(second)}`
  );
  assert(store.lastFiredResponseCount === 30, 'store unchanged on skip');

  // Exactly one fire recorded for band 1
  let fires = 1; // first succeeded
  if (second.ok) fires += 1;
  assert(fires === 1, 'fires exactly once per band');

  // Next band fires again
  const third = claimFireOnceInMemory(store, 55, threshold);
  assert(third.ok && third.band === 2, 'band 2 fires');
  assert(store.lastFiredResponseCount === 55, 'store advanced to band 2');

  const fourth = claimFireOnceInMemory(store, 60, threshold);
  assert(
    !fourth.ok && fourth.reason === 'already_fired_this_band',
    'band 2 second attempt skipped'
  );

  // Mirror maybeFireSurveyAutotrigger skippedReason string for same-band
  const skippedReason = fourth.ok ? null : fourth.reason;
  assert(
    skippedReason === 'already_fired_this_band',
    'skippedReason matches autotrigger-service'
  );

  console.log({
    threshold,
    bands: [0, 1, 2, 3].map((b) => ({
      count: b * threshold,
      band: autotriggerResponseBand(b * threshold, threshold),
    })),
    store,
  });
  console.log('PASS: autotrigger fire-once — band math + idempotent claim');
}

main();
