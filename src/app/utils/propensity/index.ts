/** Propensity read-layer (P1 prior → P2 decaying blend → P3/P4 funnel). */
export * from './types';
export {
  computePriorP0,
  effectiveMapParty,
  priorWeightForBlend,
  resolvePropensityForOrchestrator,
  propensityDecisionValue,
} from './prior';
