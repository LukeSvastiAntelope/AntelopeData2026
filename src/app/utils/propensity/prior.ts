/**
 * P1 — Coarse cold-start prior from Map / collation inputs.
 *
 * Transparent heuristic (not a trained model). Recomputed every call.
 * Output p0 ∈ [0,1] is a prior input for later decaying blend — never a
 * targetable score (data as MAP, not verdict).
 */

import type { PriorComponents, PriorMapInputs, PriorResult } from './types';
import { getDecayK } from './config';

const FORMULA = 'p1.prior.v1' as const;

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  return Math.min(1, Math.max(0, n));
}

function normParty(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const p = raw.trim().toLowerCase();
  if (!p) return null;
  if (p === 'd' || p === 'dem' || p.startsWith('democrat')) return 'Democrat';
  if (p === 'r' || p === 'rep' || p.startsWith('republican')) return 'Republican';
  if (p === 'i' || p === 'ind' || p.startsWith('independent')) return 'Independent';
  if (p === 'u' || p.startsWith('unaffil') || p === 'npp' || p.includes('no party')) {
    return 'Unaffiliated';
  }
  return raw.trim();
}

/** Effective Map lean: door-confirmed party wins when present. */
export function effectiveMapParty(inputs: PriorMapInputs): string | null {
  return normParty(inputs.canvassParty) || normParty(inputs.party);
}

/**
 * Party registration → coarse base on Dem-lean scale.
 * Deliberately coarse (±0.25 from center).
 */
function partyBase(party: string | null): { value: number; note: string } {
  switch (party) {
    case 'Democrat':
      return { value: 0.72, note: 'party=Democrat → base 0.72' };
    case 'Republican':
      return { value: 0.28, note: 'party=Republican → base 0.28' };
    case 'Independent':
      return { value: 0.5, note: 'party=Independent → base 0.50' };
    case 'Unaffiliated':
      return { value: 0.48, note: 'party=Unaffiliated → base 0.48' };
    default:
      return { value: 0.5, note: 'party=unknown → base 0.50' };
  }
}

/**
 * Registration status — slight pull toward engagement center for Inactive
 * (less informative lean), tiny confidence bump for Registered.
 */
function registrationAdj(status: string | null | undefined): { value: number; note: string } {
  if (!status) return { value: 0, note: 'voter_status=missing → +0' };
  const s = status.trim().toLowerCase();
  if (s === 'registered' || s === 'active' || s === 'a') {
    return { value: 0.02, note: 'voter_status=Registered → +0.02 (informative)' };
  }
  if (s === 'inactive' || s === 'purged' || s === 'i') {
    return { value: -0.03, note: 'voter_status=Inactive → −0.03 (weaker signal)' };
  }
  return { value: 0, note: `voter_status=${status} → +0` };
}

/**
 * Primary-pull history — strong coarse signal when present.
 * Dem primary → +; Rep primary → −.
 */
function primaryAdj(
  pull: PriorMapInputs['primaryPull']
): { value: number; note: string } {
  if (!pull || pull === 'unknown') {
    return { value: 0, note: 'primary_pull=unknown → +0' };
  }
  if (pull === 'democratic') {
    return { value: 0.1, note: 'primary_pull=democratic → +0.10' };
  }
  if (pull === 'republican') {
    return { value: -0.1, note: 'primary_pull=republican → −0.10' };
  }
  return { value: 0, note: 'primary_pull=nonpartisan → +0' };
}

/**
 * Geography / precinct baseline — transparent constants, not a model.
 * District codes with known lean get a tiny adj; precinct reserved for later.
 */
function geographyAdj(inputs: PriorMapInputs): { value: number; note: string } {
  const district = (inputs.district || '').trim().toUpperCase();
  const precinct = (inputs.precinct || '').trim();

  // Tiny district baselines (examples; safe to extend as a table later)
  const DISTRICT_LEAN: Record<string, number> = {
    'CA-11': 0.06, // Bay Area Dem-lean
    'CA-12': 0.07,
    'CA-15': 0.05,
    'TX-02': -0.05,
    'FL-01': -0.06,
  };

  if (district && DISTRICT_LEAN[district] != null) {
    const v = DISTRICT_LEAN[district];
    const note = precinct
      ? `district=${district} lean ${v >= 0 ? '+' : ''}${v} (precinct=${precinct} noted, unused in v1)`
      : `district=${district} lean ${v >= 0 ? '+' : ''}${v}`;
    return { value: v, note };
  }

  if (precinct) {
    return { value: 0, note: `precinct=${precinct} present but no baseline table yet → +0` };
  }
  if (district) {
    return { value: 0, note: `district=${district} (no baseline) → +0` };
  }
  return { value: 0, note: 'geography missing → +0' };
}

/**
 * Optional partisan_score (0–100) from voter_geo — weak pull toward that MAP.
 * Weight kept small so registration/primary remain primary Map signals.
 */
function partisanScoreAdj(score100: number | null | undefined): { value: number; note: string } {
  if (score100 == null || !Number.isFinite(score100)) {
    return { value: 0, note: 'partisan_score=missing → +0' };
  }
  const mapped = clamp01(score100 / 100);
  // Pull 15% of the way from 0.5 toward mapped score, expressed as additive adj
  const adj = (mapped - 0.5) * 0.15;
  return {
    value: adj,
    note: `partisan_score=${score100} → adj ${adj >= 0 ? '+' : ''}${adj.toFixed(3)}`,
  };
}

/**
 * Recompute coarse prior p0 from Map inputs. Pure + deterministic.
 */
export function computePriorP0(inputs: PriorMapInputs): PriorResult {
  const effectiveParty = effectiveMapParty(inputs);
  const party = partyBase(effectiveParty);
  const reg = registrationAdj(inputs.voterStatus);
  const prim = primaryAdj(inputs.primaryPull ?? null);
  const geo = geographyAdj(inputs);
  const ps = partisanScoreAdj(inputs.partisanScore100);

  const components: PriorComponents = {
    partyBase: party.value,
    registrationAdj: reg.value,
    primaryAdj: prim.value,
    geographyAdj: geo.value,
    partisanScoreAdj: ps.value,
  };

  let p0 = party.value + prim.value + geo.value + ps.value;

  // Registration: Registered slightly amplifies lean; Inactive damps toward center
  const status = (inputs.voterStatus || '').trim().toLowerCase();
  if (status === 'registered' || status === 'active' || status === 'a') {
    if (party.value !== 0.5) {
      p0 += Math.sign(party.value - 0.5) * Math.abs(reg.value);
    }
  } else if (status === 'inactive' || status === 'purged' || status === 'i') {
    p0 = 0.5 + (p0 - 0.5) * 0.85;
  }

  p0 = clamp01(p0);

  return {
    p0,
    components,
    effectiveParty,
    provenance: [party.note, reg.note, prim.note, geo.note, ps.note, `p0=${p0.toFixed(4)}`],
    formulaVersion: FORMULA,
  };
}

/**
 * Prior weight helper (count → e). Canonical math: w = exp(-k · e).
 */
export function priorWeightForBlend(responseEvidenceCount: number, k?: number): number {
  const n = Math.max(0, Number(responseEvidenceCount) || 0);
  const decay = k ?? getDecayK();
  if (n <= 0) return 1;
  return clamp01(Math.exp(-decay * n));
}

/**
 * Tripwire helper: decision paths must not receive raw prior.p0.
 * Returns only the blended scalar (+ metadata without prior.p0 as a top-level field).
 */
export function propensityDecisionValue(read: {
  blended: number;
  priorWeight: number;
  phase: string;
}): {
  value: number;
  priorWeight: number;
  phase: string;
} {
  return {
    value: read.blended,
    priorWeight: read.priorWeight,
    phase: read.phase,
  };
}
