/**
 * P1 unit checks — prior recompute, decay stub, no-raw-prior decision path.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/propensity/test-prior.ts
 */

import {
  computePriorP0,
  priorWeightForBlend,
  propensityDecisionValue,
} from '../../src/app/utils/propensity/prior'
import { resolvePropensityForOrchestrator } from '../../src/app/utils/propensity/blend';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function approx(a: number, b: number, eps = 1e-6) {
  return Math.abs(a - b) <= eps;
}

function main() {
  // --- Recompute tripwire: pure / deterministic ---
  const dem = computePriorP0({
    party: 'Democrat',
    voterStatus: 'Registered',
    district: 'CA-11',
  });
  const dem2 = computePriorP0({
    party: 'Democrat',
    voterStatus: 'Registered',
    district: 'CA-11',
  });
  assert(approx(dem.p0, dem2.p0), 'prior must recompute identically for same inputs');
  assert(dem.p0 > 0.55, `Democrat prior should lean Dem, got ${dem.p0}`);
  assert(dem.p0 <= 1 && dem.p0 >= 0, 'p0 must be in [0,1]');

  const rep = computePriorP0({
    party: 'Republican',
    voterStatus: 'Registered',
    district: 'FL-01',
  });
  assert(rep.p0 < 0.45, `Republican prior should lean Rep, got ${rep.p0}`);

  const ind = computePriorP0({ party: 'Independent', voterStatus: 'Registered' });
  assert(Math.abs(ind.p0 - 0.5) < 0.08, `Independent near center, got ${ind.p0}`);

  // Primary-pull moves the prior
  const demPrimary = computePriorP0({
    party: 'Independent',
    primaryPull: 'democratic',
  });
  const repPrimary = computePriorP0({
    party: 'Independent',
    primaryPull: 'republican',
  });
  assert(demPrimary.p0 > repPrimary.p0, 'Dem primary pull must raise p0 vs Rep primary');

  // Canvass party overrides registration for effective lean
  const doorFlip = computePriorP0({
    party: 'Republican',
    canvassParty: 'Democrat',
    voterStatus: 'Registered',
  });
  assert(doorFlip.effectiveParty === 'Democrat', 'canvass_party should win');
  assert(doorFlip.p0 > 0.55, 'door-confirmed Dem should lean Dem');

  // Changing an input changes p0 (not a frozen ballistic score)
  const changed = computePriorP0({
    party: 'Republican',
    voterStatus: 'Registered',
    district: 'CA-11',
  });
  assert(!approx(dem.p0, changed.p0), 'different party must change recomputed prior');

  // --- Decay tripwire surface (P1 stub): weight 1 with no evidence; falls with evidence ---
  assert(priorWeightForBlend(0) === 1, 'no evidence → priorWeight=1');
  assert(priorWeightForBlend(1) < 1, 'any response evidence must decay prior weight');
  assert(priorWeightForBlend(10) < priorWeightForBlend(1), 'more evidence → lower weight');

  // --- Orchestrator must read blended, not raw prior ---
  const read = resolvePropensityForOrchestrator(
    { party: 'Democrat', voterStatus: 'Registered', district: 'CA-11' },
    0
  );
  assert(read.phase === 'p1_prior_only', 'P1 phase tag');
  assert(approx(read.blended, read.prior.p0), 'P1 blended === p0 when weight=1');
  const decision = propensityDecisionValue(read);
  assert(approx(decision.value, read.blended), 'decision value must be blended');
  assert(!('p0' in decision), 'decision payload must not expose raw p0');
  assert(!('prior' in decision), 'decision payload must not embed prior object');

  // With evidence, blended must move off raw prior (stub posterior 0.5)
  const readE = resolvePropensityForOrchestrator(
    { party: 'Democrat', voterStatus: 'Registered', district: 'CA-11' },
    3
  );
  assert(readE.priorWeight < 1, 'evidence decays weight');
  assert(
    !approx(readE.blended, readE.prior.p0),
    'with evidence, blended must not equal raw prior (decay tripwire)'
  );

  console.log({
    dem: dem.p0,
    rep: rep.p0,
    demPrimary: demPrimary.p0,
    repPrimary: repPrimary.p0,
    doorFlip: doorFlip.p0,
    provenanceSample: dem.provenance,
  });
  console.log('PASS: P1 prior — recompute, decay surface, no-raw-prior decision');
}

main();
