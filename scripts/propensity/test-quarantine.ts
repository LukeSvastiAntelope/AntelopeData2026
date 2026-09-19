/**
 * P4 quarantine + decay tripwires.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/propensity/test-quarantine.ts
 */

import { computePropensityBlend } from '../../src/app/utils/propensity/blend';
import { propensityDecisionValue } from '../../src/app/utils/propensity/prior';
import {
  assertNoRawPriorInDecision,
  isOrchestratorPropensityView,
  orchestratorViewFromRead,
  stripRawPriorFromPayload,
  toOrchestratorPropensity,
} from '../../src/app/utils/propensity/quarantine';
import { DEFAULT_DECAY_K } from '../../src/app/utils/propensity/config';
import { propensityReadFromBlend } from '../../src/app/utils/propensity/blend';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function approx(a: number, b: number, eps = 1e-2) {
  return Math.abs(a - b) <= eps;
}

function main() {
  // --- Decay + recompute: logged engagement → w near 0, P ≈ q ---
  // Substantive survey response collapses prior weight
  const withResponse = computePropensityBlend(
    { party: 'Republican', voterStatus: 'Registered' },
    [{ kind: 'survey_response', sentiment01: 0.9 }],
    { decayK: DEFAULT_DECAY_K }
  );
  assert(withResponse.evidenceE >= 2, `response must raise e, got ${withResponse.evidenceE}`);
  assert(
    withResponse.priorWeight < 0.2,
    `logged response must collapse w near 0, got ${withResponse.priorWeight}`
  );
  assert(withResponse.posteriorQ != null, 'response must define q');
  // Door-knock / confirm-scale evidence: P tracks q tightly
  const door = computePropensityBlend(
    { party: 'Republican' },
    [{ kind: 'canvass_confirmed', party: 'Democrat' }],
    { decayK: DEFAULT_DECAY_K }
  );
  assert(door.priorWeight < 0.15, `door confirm collapses w, got ${door.priorWeight}`);
  assert(door.posteriorQ != null, 'confirm defines q');
  assert(
    approx(door.propensity, door.posteriorQ as number, 0.05),
    `after confirm P ≈ q (P=${door.propensity}, q=${door.posteriorQ})`
  );
  // Survey alone: live dominates (P closer to q than to prior)
  assert(
    Math.abs(withResponse.propensity - (withResponse.posteriorQ as number)) <
      Math.abs(withResponse.propensity - withResponse.p0),
    'after response, P closer to q than to prior'
  );

  // Cold start still equals prior
  const cold = computePropensityBlend({ party: 'Democrat' }, []);
  assert(approx(cold.propensity, cold.p0), 'no signal → P = p0');
  assert(approx(cold.priorWeight, 1), 'no signal → w = 1');

  // --- Orchestrator quarantine type ---
  const read = propensityReadFromBlend(door);
  const view = orchestratorViewFromRead(read);
  assert(isOrchestratorPropensityView(view), 'view must pass structural check');
  assert(approx(view.blended, door.propensity), 'blended equals P');
  assert(view.tier === door.tier, 'tier matches');
  assert(!('p0' in view), 'view must not have p0');
  assert(!('priorP0' in view), 'view must not have priorP0');
  assert(!('prior' in view), 'view must not embed prior');

  const decision = propensityDecisionValue(read);
  assert(approx(decision.value, read.blended), 'decision.value = blended');
  assert(!('p0' in decision), 'decision payload has no p0');
  assert(!('prior' in decision), 'decision payload has no prior');
  assertNoRawPriorInDecision(decision, 'propensityDecisionValue');
  assertNoRawPriorInDecision(view, 'orchestratorView');

  // Strip guard removes leaks from nested tool payloads
  const dirty = {
    whoToWork: [{ blended: 0.8, tier: 'hot', priorP0: 0.28, prior: { p0: 0.28 } }],
    voters: [{ blended: 0.5, p0: 0.5, prior_p0: 0.5 }],
  };
  const clean = stripRawPriorFromPayload(dirty);
  assertNoRawPriorInDecision(clean, 'stripped tool data');
  assert(
    (clean.whoToWork[0] as { blended: number }).blended === 0.8,
    'strip keeps blended'
  );
  assert(
    !('priorP0' in (clean.whoToWork[0] as object)),
    'strip removes priorP0'
  );

  // toOrchestratorPropensity never copies prior
  const projected = toOrchestratorPropensity({
    blended: 0.7,
    priorWeight: 0.1,
    confidence: 0.9,
    tier: 'hot',
    phase: 'p4_tier',
  });
  assert(projected.signal === 'confirmed', 'high conf → confirmed');
  assert(projected.phase === 'p4_tier', 'phase p4_tier');

  // Tripwire fails loudly if raw prior sneaks in
  let threw = false;
  try {
    assertNoRawPriorInDecision({ blended: 0.5, priorP0: 0.2 }, 'should-fail');
  } catch {
    threw = true;
  }
  assert(threw, 'assertNoRawPriorInDecision must throw on priorP0');

  console.log({
    response: {
      w: withResponse.priorWeight,
      P: withResponse.propensity,
      q: withResponse.posteriorQ,
    },
    door: { w: door.priorWeight, P: door.propensity, q: door.posteriorQ },
    view,
  });
  console.log('PASS: P4 quarantine — decay P≈q, no-raw-prior decision view');
}

main();
