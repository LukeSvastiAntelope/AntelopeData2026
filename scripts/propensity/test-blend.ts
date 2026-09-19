/**
 * P2 unit checks — decay blend, evidence posterior, confidence, tier.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/propensity/test-blend.ts
 */

import {
  computePropensityBlend,
  priorWeightFromEvidence,
  propensityReadFromBlend,
  resolvePropensityForOrchestrator,
} from '../../src/app/utils/propensity/blend';
import { accumulateEvidence } from '../../src/app/utils/propensity/evidence';
import { bucketTier, DEFAULT_DECAY_K } from '../../src/app/utils/propensity/config';
import { propensityDecisionValue } from '../../src/app/utils/propensity/prior';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function approx(a: number, b: number, eps = 1e-6) {
  return Math.abs(a - b) <= eps;
}

function main() {
  // --- w = exp(-k · e) ---
  assert(approx(priorWeightFromEvidence(0, DEFAULT_DECAY_K), 1), 'e=0 → w=1');
  const wSmall = priorWeightFromEvidence(0.5, DEFAULT_DECAY_K);
  const wDoor = priorWeightFromEvidence(3.0, DEFAULT_DECAY_K);
  assert(wSmall < 1 && wSmall > 0.5, `modest e should leave substantial prior weight, got ${wSmall}`);
  assert(wDoor < 0.15, `door-confirm-scale e≈3 must collapse w (got ${wDoor})`);
  assert(priorWeightFromEvidence(10, 0.85) < priorWeightFromEvidence(3, 0.85), 'more e → lower w');

  // Larger k overrides prior faster
  assert(
    priorWeightFromEvidence(2, 1.5) < priorWeightFromEvidence(2, 0.5),
    'higher k decays faster'
  );

  // --- Cold start: no events → P = p0, confidence 0 ---
  const cold = computePropensityBlend(
    { party: 'Democrat', voterStatus: 'Registered', district: 'CA-11' },
    []
  );
  assert(approx(cold.propensity, cold.p0), 'no signal → P equals prior');
  assert(approx(cold.priorWeight, 1), 'no signal → w=1');
  assert(approx(cold.confidence, 0), 'no signal → confidence=0');
  assert(cold.posteriorQ == null, 'no directional signal → q undefined');
  assert(cold.evidenceE === 0, 'e=0 with empty stream');

  // --- Door confirm collapses prior ---
  const door = computePropensityBlend(
    { party: 'Republican', voterStatus: 'Registered' },
    [{ kind: 'canvass_confirmed', party: 'Democrat' }],
    { decayK: DEFAULT_DECAY_K }
  );
  assert(door.evidenceE >= 2.5, `confirm must drive e high, got ${door.evidenceE}`);
  assert(door.priorWeight < 0.2, `confirm must collapse w, got ${door.priorWeight}`);
  assert(door.confidence > 0.8, `confirm → high confidence, got ${door.confidence}`);
  assert(door.posteriorQ != null && door.posteriorQ > 0.7, 'Dem confirm → high q');
  assert(
    Math.abs(door.propensity - (door.posteriorQ as number)) <
      Math.abs(door.propensity - door.p0),
    'after confirm, P closer to q than to prior'
  );
  assert(door.propensity > 0.6, 'Dem door confirm should pull P hot-ward');

  // --- Opt-out / refuse pulls q low ---
  const refuse = computePropensityBlend({ party: 'Democrat' }, [
    { kind: 'canvass_refused' },
  ]);
  assert(refuse.posteriorQ != null && refuse.posteriorQ < 0.25, 'refuse → low q');
  assert(refuse.propensity < refuse.p0, 'refuse must pull P below prior');

  // --- Survey response is substantive ---
  const survey = computePropensityBlend({ party: 'Independent' }, [
    { kind: 'survey_response', sentiment01: 0.9 },
  ]);
  assert(survey.priorWeight < 0.3, 'survey response collapses w substantially');
  assert(survey.posteriorQ != null && survey.posteriorQ > 0.8, 'positive sentiment → high q');

  // --- Recency: old evidence weighs less ---
  const now = Date.now();
  const fresh = accumulateEvidence(
    [{ kind: 'canvass_confirmed', party: 'Democrat', atMs: now }],
    now
  );
  const stale = accumulateEvidence(
    [
      {
        kind: 'canvass_confirmed',
        party: 'Democrat',
        atMs: now - 90 * 24 * 60 * 60 * 1000,
      },
    ],
    now
  );
  assert(fresh.e > stale.e, 'stale confirm contributes less evidence');

  // --- Tiers ---
  assert(bucketTier(0.85) === 'hot', 'hot tier');
  assert(bucketTier(0.55) === 'warm', 'warm tier');
  assert(bucketTier(0.2) === 'cold', 'cold tier');
  assert(door.tier === bucketTier(door.propensity), 'blend tier matches bucket(P)');

  // --- Orchestrator read: blended only ---
  const read = propensityReadFromBlend(door);
  const decision = propensityDecisionValue(read);
  assert(approx(decision.value, door.propensity), 'decision = blended P');
  assert(!('p0' in decision), 'decision must not expose raw p0');
  assert(!('prior' in decision), 'decision must not embed prior');
  assert(read.phase === 'p2_blend', 'door confirm → p2_blend phase');

  const noEv = resolvePropensityForOrchestrator(
    { party: 'Democrat', voterStatus: 'Registered' },
    0
  );
  assert(noEv.phase === 'p1_prior_only', 'zero evidence stays p1 phase tag');
  assert(approx(noEv.blended, noEv.prior.p0), 'blended === p0 with no evidence');

  // Recompute tripwire: same inputs → same P
  const again = computePropensityBlend(
    { party: 'Republican', voterStatus: 'Registered' },
    [{ kind: 'canvass_confirmed', party: 'Democrat' }],
    { decayK: DEFAULT_DECAY_K }
  );
  assert(approx(again.propensity, door.propensity), 'blend must recompute identically');

  console.log({
    coldStart: { P: cold.propensity, w: cold.priorWeight, conf: cold.confidence },
    doorConfirm: {
      P: door.propensity,
      w: door.priorWeight,
      q: door.posteriorQ,
      e: door.evidenceE,
      tier: door.tier,
    },
    refuse: { P: refuse.propensity, q: refuse.posteriorQ },
    decayK: DEFAULT_DECAY_K,
  });
  console.log('PASS: P2 blend — decay, posterior, confidence, tier, no-raw-prior');
}

main();
