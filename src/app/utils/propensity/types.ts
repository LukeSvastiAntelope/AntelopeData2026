/**
 * Propensity read-layer types (P1+).
 *
 * Legal invariant against the thesis:
 *   - Values are recomputed from inputs / event stream (never a frozen ballistic score).
 *   - The prior’s blend weight decays toward zero once the voter responds (P2).
 *   - The Orchestrator reads `blended` only — never `prior.p0` as a decision input.
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
 * What the Orchestrator (and any decision path) may read.
 * `blended` is the only decision-facing value — even when P1 has no event blend yet.
 */
export type PropensityRead = {
  /** Always prefer this field for decisions / tools / funnel. */
  blended: number;
  /**
   * Current weight on the prior in the blend (P1: 1.0 with no responses).
   * Decays toward 0 as response evidence accumulates (P2).
   */
  priorWeight: number;
  /** Cold-start prior — for audit / decay math only. NEVER pass to decision logic. */
  prior: PriorResult;
  /** Evidence count driving decay (P1 always 0). */
  responseEvidenceCount: number;
  /** Phase tag so callers know blend maturity. */
  phase: 'p1_prior_only' | 'p2_blend' | 'p3_funnel' | 'p4_tier';
};
