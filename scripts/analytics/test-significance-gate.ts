/**
 * Significance-gate invariants (postable-insight-service).
 *
 *   npx tsx --tsconfig tsconfig.json scripts/analytics/test-significance-gate.ts
 */

import {
  POSTABLE_INSIGHT_THRESHOLDS,
  benjaminiHochberg,
  contrastPassesPublishGate,
  isBelowTotalResponseFloor,
  twoProportionZTest,
  welchTTest,
} from '../../src/app/utils/services/postable-insight-service';
import { needsSmallSampleDisclaimer } from '../../src/app/utils/services/autotrigger-outputs';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function approx(a: number, b: number, eps = 1e-2) {
  return Math.abs(a - b) <= eps;
}

function main() {
  const thresholds = POSTABLE_INSIGHT_THRESHOLDS;
  assert(thresholds.minTotalResponses === 80, 'default minTotalResponses=80');
  assert(thresholds.minCellSize === 25, 'default minCellSize=25');

  // --- twoProportionZTest: hand fixture ---
  // nA=nB=100, sA=60, sB=40 → pA=0.6, pB=0.4, pPool=0.5
  // se = sqrt(0.5*0.5*(0.01+0.01)) = sqrt(0.005) ≈ 0.070710678
  // z = 0.2/se ≈ 2.828427; two-sided p ≈ 0.0046777
  const z = twoProportionZTest(60, 100, 40, 100);
  assert(approx(z.pA, 0.6), `pA=${z.pA}`);
  assert(approx(z.pB, 0.4), `pB=${z.pB}`);
  assert(approx(z.absoluteEffect, 0.2), `effect=${z.absoluteEffect}`);
  assert(approx(z.pValue, 0.00468, 1e-2), `pValue=${z.pValue}`);

  // --- welchTTest: equal-var large-n groups ---
  // A ~ N(0,1)-ish: mean 0; B shifted by +1
  const valuesA = Array.from({ length: 40 }, (_, i) => (i % 10) / 10 - 0.45);
  const valuesB = valuesA.map((v) => v + 1);
  const t = welchTTest(valuesA, valuesB);
  assert(approx(t.meanB - t.meanA, 1, 1e-9), `mean delta=${t.meanB - t.meanA}`);
  assert(approx(t.absoluteEffect, 1, 1e-9), `abs effect=${t.absoluteEffect}`);
  assert(t.pValue < 0.01, `welch p should be tiny, got ${t.pValue}`);

  // --- benjaminiHochberg: known vector + monotonicity on sorted ---
  const raw = [0.01, 0.04, 0.03, 0.002, 0.5];
  const adj = benjaminiHochberg(raw);
  // Hand BH (m=5), sorted raw → adj: 0.002→0.01, 0.01→0.025, 0.03→0.05, 0.04→0.05, 0.5→0.5
  assert(approx(adj[3], 0.01, 1e-2), `adj[0.002]=${adj[3]}`);
  assert(approx(adj[0], 0.025, 1e-2), `adj[0.01]=${adj[0]}`);
  assert(approx(adj[2], 0.05, 1e-2), `adj[0.03]=${adj[2]}`);
  assert(approx(adj[1], 0.05, 1e-2), `adj[0.04]=${adj[1]}`);
  assert(approx(adj[4], 0.5, 1e-2), `adj[0.5]=${adj[4]}`);
  const byRaw = [...raw.keys()].sort((i, j) => raw[i] - raw[j]);
  for (let k = 1; k < byRaw.length; k++) {
    assert(
      adj[byRaw[k]] + 1e-12 >= adj[byRaw[k - 1]],
      `BH monotonicity broken at ${k}`
    );
  }

  // --- Gate: totalResponses < 80 suppressed ---
  assert(isBelowTotalResponseFloor(79, thresholds), '79 < 80 suppressed');
  assert(!isBelowTotalResponseFloor(80, thresholds), '80 clears floor');

  // --- Gate: cellSize < 25 suppressed ---
  assert(
    !contrastPassesPublishGate(
      { nA: 24, nB: 40, absoluteEffect: 0.3 },
      0.001,
      thresholds
    ),
    'thin cell A suppressed'
  );
  assert(
    !contrastPassesPublishGate(
      { nA: 40, nB: 24, absoluteEffect: 0.3 },
      0.001,
      thresholds
    ),
    'thin cell B suppressed'
  );

  // --- Gate: passes with real effect + corrected p ---
  const passing = contrastPassesPublishGate(
    { nA: 40, nB: 40, absoluteEffect: 0.2 },
    0.01,
    thresholds
  );
  assert(passing, 'large cells + effect + p must pass');

  // Small absolute effect fails even with tiny p
  assert(
    !contrastPassesPublishGate(
      { nA: 40, nB: 40, absoluteEffect: 0.05 },
      0.001,
      thresholds
    ),
    'tiny effect blocked'
  );

  // --- Small-n disclaimer only when appropriate ---
  assert(
    !needsSmallSampleDisclaimer({
      claim: 'ok',
      caveat: '',
      nA: 40,
      nB: 40,
      flag: 'publishable',
      totalResponses: 120,
    }),
    'comfortable publishable needs no small-n disclaimer'
  );
  assert(
    needsSmallSampleDisclaimer({
      claim: 'thin',
      caveat: '',
      nA: 40,
      nB: 40,
      flag: 'directional_only',
      totalResponses: 120,
    }),
    'directional_only always carries disclaimer'
  );
  assert(
    needsSmallSampleDisclaimer({
      claim: 'thin-cell',
      caveat: '',
      nA: 20,
      nB: 40,
      flag: 'publishable',
      totalResponses: 120,
    }),
    'cell under minCellSize carries disclaimer'
  );

  // Numbers computed in TS (not stubbed): recompute z and gate together
  const live = twoProportionZTest(40, 50, 20, 50);
  assert(live.pValue < 0.05, `live contrast p=${live.pValue}`);
  assert(
    contrastPassesPublishGate(
      { nA: 50, nB: 50, absoluteEffect: live.absoluteEffect },
      live.pValue,
      thresholds
    ),
    'live computed contrast clears gate'
  );

  console.log({
    z: { p: z.pValue, effect: z.absoluteEffect },
    welchP: t.pValue,
    bh: adj,
    thresholds: {
      minTotal: thresholds.minTotalResponses,
      minCell: thresholds.minCellSize,
      alpha: thresholds.alpha,
      minEffect: thresholds.minAbsoluteEffect,
    },
  });
  console.log('PASS: significance-gate — z/welch/BH fixtures + publish floor');
}

main();
