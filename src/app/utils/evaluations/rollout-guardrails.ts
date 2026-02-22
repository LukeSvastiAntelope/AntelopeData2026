export type RolloutStage = 'internal' | 'pilot' | 'broad';

export interface RolloutGuardrailInput {
  repetitionScore: number;
  freshnessScore: number;
  latencyMs?: number;
}

export function getRolloutStage(): RolloutStage {
  const raw = (process.env.NEWS_ROLLOUT_STAGE || 'internal').toLowerCase();
  if (raw === 'pilot' || raw === 'broad') return raw;
  return 'internal';
}

export function shouldTriggerRollback(input: RolloutGuardrailInput): {
  rollback: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  if (input.repetitionScore > 0.9) reasons.push('repetition_spike');
  if (input.freshnessScore < 0.2) reasons.push('freshness_miss');
  if (typeof input.latencyMs === 'number' && input.latencyMs > 25000) reasons.push('latency_regression');
  return { rollback: reasons.length > 0, reasons };
}

export interface AgentRolloutGuardrailInput {
  plannerErrorRate: number;
  docWriteFailureRate: number;
  p95LatencyMs: number;
}

export function getAgentRolloutStage(): RolloutStage {
  const raw = (process.env.AGENTS_ROLLOUT_STAGE || 'internal').toLowerCase();
  if (raw === 'pilot' || raw === 'broad') return raw;
  return 'internal';
}

export function shouldTriggerAgentRollback(input: AgentRolloutGuardrailInput): {
  rollback: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  if (input.plannerErrorRate > 0.08) reasons.push('planner_error_rate_spike');
  if (input.docWriteFailureRate > 0.05) reasons.push('situation_doc_write_failures');
  if (input.p95LatencyMs > 12000) reasons.push('multi_agent_latency_regression');
  return { rollback: reasons.length > 0, reasons };
}
