/** Propensity read-layer (P1 prior → P2 decaying blend → P3/P4 funnel). */
export * from './types';
export {
  computePriorP0,
  effectiveMapParty,
  priorWeightForBlend,
  propensityDecisionValue,
} from './prior';
export {
  computePropensityBlend,
  priorWeightFromEvidence,
  propensityReadFromBlend,
  resolvePropensityForOrchestrator,
} from './blend';
export {
  accumulateEvidence,
  eventsFromPersonCanvass,
  eventsFromTurfOutcome,
} from './evidence';
export {
  getDecayK,
  DEFAULT_DECAY_K,
  bucketTier,
  tierRank,
  isConfirmedConfidence,
  CONFIDENCE_CONFIRMED_THRESHOLD,
  PROPENSITY_FORMULA_VERSION,
} from './config';
export { whoToWorkSortKey, sortWhoToWork } from './sales';
export type { WhoToWorkInput } from './sales';
