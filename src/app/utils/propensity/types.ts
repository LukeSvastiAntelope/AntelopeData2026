/**
 * Propensity read-layer types (P1–P4).
 *
 * Legal invariant against the thesis:
 *   - Values are recomputed from inputs / event stream (never a frozen ballistic score).
 *   - The prior’s blend weight decays toward zero once the voter responds (P2).
 *   - The Orchestrator reads `blended` (+ tier) only — never `prior.p0` as a decision input.
 *
 * Tripwires (tests must fail if broken): recompute | decay | no-raw-prior-in-decision.
 */

/** Coarse cold-start prior inputs — Map / collation fields only (P1). */
export type PriorMapInputs = {
  /** Party registration lean (Democrat / Republican / Independent / Unaffiliated / …). */
  party?: string | null;
  /** Door-confirmed party wins for display lean; still Map-adjacent field data. */
  canvassParty?: string | null;
  /** Registration status (Registered / Inactive / …). */
  voterStatus?: string | null;
  /** Congressional / map district code, e.g. CA-11. */
  district?: string | null;
  /** ZIP — weak geography baseline when district missing. */
  zip?: string | null;
  state?: string | null;
  /**
   * Which primary ballot they typically pull (coarse signal).
   * Optional until collation projects it; may come from source payload.
   */
  primaryPull?: 'democratic' | 'republican' | 'nonpartisan' | 'unknown' | null;
  /** Precinct id/name when available (optional; Map schema may not have it yet). */
  precinct?: string | null;
  /**
   * Optional TargetSmart-style partisan score on [0,100] if joined from voter_geo.
   * Treated as a weak Map-adjacent signal, never as the prior itself.
   */
  partisanScore100?: number | null;
};

/** Transparent component breakdown — heuristic, not a trained model. */
export type PriorComponents = {
  partyBase: number;
  registrationAdj: number;
  primaryAdj: number;
  geographyAdj: number;
  partisanScoreAdj: number;
};

/**
 * Prior p0 ∈ [0,1] — coarse propensity toward Dem-lean scale (1=Dem, 0=Rep, 0.5=swing).
 * Explicitly NOT a targetable score. Cold-start MAP input only.
 * Never placed on Orchestrator ctx or tool decision payloads.
 */
export type PriorResult = {
  /** Coarse prior. Recomputed from inputs; do not persist as a ballistic target. */
  p0: number;
  components: PriorComponents;
  /** Effective party used for the party base. */
  effectiveParty: string | null;
  /** Human-readable provenance for audit / UI footnotes. */
  provenance: string[];
  /** Schema version of the heuristic (bump when formula changes). */
  formulaVersion: 'p1.prior.v1';
};

/**
 * Full internal read (blend math + audit prior).
 * Decision code must project through `toOrchestratorPropensity` / `propensityDecisionValue`
 * — never pass `prior.p0` into the Orchestrator loop.
 */
export type PropensityRead = {
  /** Always prefer this field for decisions / tools / funnel. */
  blended: number;
  /**
   * Current weight on the prior in the blend (P1: 1.0 with no responses).
   * Decays toward 0 as engagement accumulates (P2): w = exp(-k · e).
   */
  priorWeight: number;
  /** Cold-start prior — for audit / decay math only. NEVER pass to decision logic. */
  prior: PriorResult;
  /** Evidence event count (audit). */
  responseEvidenceCount: number;
  /** Phase tag so callers know blend maturity. */
  phase: 'p1_prior_only' | 'p2_blend' | 'p3_funnel' | 'p4_tier';
  /** P2: confidence = 1 − w */
  confidence?: number;
  /** P2: observed posterior; null until directional signal */
  posteriorQ?: number | null;
  /** P2/P3: hot | warm | cold */
  tier?: 'hot' | 'warm' | 'cold';
  /** P2: accumulated evidence e */
  evidenceE?: number;
};

/**
 * P4 — What the Orchestrator (consultant tool loop / decision path) may see.
 * Omits raw prior p0 entirely. Explore→exploit reads `blended` + `tier` only.
 */
export type PropensityOrchestratorView = {
  /** Recomputed blend P = w·p0 + (1−w)·q — the only decision scalar. */
  blended: number;
  /**
   * Alias of blended for older decision helpers / tests.
   * Prefer `blended` in new code.
   */
  value: number;
  /** Funnel bucket of blended P. */
  tier: 'hot' | 'warm' | 'cold';
  /** prior_weight w — for estimated vs confirmed UI, not a target score. */
  priorWeight: number;
  /** confidence = 1 − w */
  confidence: number;
  /** estimated (prior-heavy) vs confirmed (engagement-heavy) */
  signal: 'estimated' | 'confirmed';
  phase: 'p1_prior_only' | 'p2_blend' | 'p3_funnel' | 'p4_tier';
};
