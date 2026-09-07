import type { AgentId, AgentSituationSnapshot } from '@/app/utils/services/agent-situation-service';

export interface AgentTaskEnvelope {
  traceId: string;
  orgId: number;
  userId: string;
  question: string;
  model: string;
  recentMessages: Array<{ role: 'user' | 'agent'; content: string }>;
  memoryContext?: string;
  newsContextSummary?: string;
  maxDepth: number;
  depth: number;
}

export interface AgentCollaborationRequest {
  requiresFrom: AgentId;
  subQuestion: string;
}

export interface AgentResult {
  agentId: AgentId;
  summary: string;
  confidence: number;
  evidenceRefs: string[];
  patch: Partial<AgentSituationSnapshot>;
  requiresFrom?: AgentCollaborationRequest;
}

export interface PlannerDecision {
  useMultiAgent: boolean;
  selectedAgents: AgentId[];
  reason: string;
  maxDepth: number;
}
