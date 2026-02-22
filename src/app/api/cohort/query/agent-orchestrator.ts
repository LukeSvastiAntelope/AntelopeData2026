import { createCompletion } from '@/app/utils/services/ai-service';
import { AgentSituationService, type AgentId } from '@/app/utils/services/agent-situation-service';
import type { AgentResult, AgentTaskEnvelope, PlannerDecision } from './agent-contracts';
import { AGENT_REGISTRY } from './agent-registry';

function pickPlannerDecision(question: string): PlannerDecision {
  const q = (question || '').toLowerCase();
  const asksNews = /(news|headline|this week|update|what changed|fundrais|endorsement|media)/.test(q);
  const asksStrategy = /(what should we do|strategy|priorit|next step|risk|opportunit|plan)/.test(q);

  if (asksNews && asksStrategy) {
    return {
      useMultiAgent: true,
      selectedAgents: ['news', 'campaign_manager'],
      reason: 'question_requires_news_and_strategy',
      maxDepth: 2,
    };
  }
  if (asksNews) {
    return {
      useMultiAgent: true,
      selectedAgents: ['news'],
      reason: 'question_requires_news',
      maxDepth: 2,
    };
  }
  if (asksStrategy) {
    return {
      useMultiAgent: true,
      selectedAgents: ['campaign_manager'],
      reason: 'question_requires_campaign_management',
      maxDepth: 2,
    };
  }
  return {
    useMultiAgent: false,
    selectedAgents: [],
    reason: 'single_agent_path_sufficient',
    maxDepth: 1,
  };
}

function extractUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s)\]]+/g) || [];
  return Array.from(new Set(matches)).slice(0, 20);
}

async function runNewsAgent(task: AgentTaskEnvelope): Promise<AgentResult> {
  const currentDoc = await AgentSituationService.getCurrent(task.orgId, 'news');
  const prompt = [
    AGENT_REGISTRY.news.systemPrompt,
    '',
    `Question: ${task.question}`,
    '',
    task.newsContextSummary ? `News context:\n${task.newsContextSummary}` : 'News context: unavailable',
    '',
    `Current news situation (v${currentDoc.version}): ${currentDoc.snapshot.summary || 'empty'}`,
    '',
    'Return concise analysis with what changed, top priorities, and evidence links.',
  ].join('\n');

  const result = await createCompletion({
    model: task.model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2,
    maxTokens: 700,
  });
  const content = String(result.content || '').trim();
  const evidenceRefs = extractUrls(content);
  return {
    agentId: 'news',
    summary: content,
    confidence: 0.72,
    evidenceRefs,
    patch: {
      summary: content.slice(0, 700),
      priorityTopics: content
        .split('\n')
        .filter((l) => l.trim().startsWith('-'))
        .map((l) => l.replace(/^-+\s*/, '').trim())
        .slice(0, 8),
      evidenceRefs,
      openQuestions: [],
    },
    requiresFrom:
      /strategy|what should we do|next step|action/i.test(task.question)
        ? { requiresFrom: 'campaign_manager', subQuestion: `Based on this news synthesis, what should we do next?\n\n${content.slice(0, 1200)}` }
        : undefined,
  };
}

async function runCampaignManagerAgent(task: AgentTaskEnvelope): Promise<AgentResult> {
  const currentDoc = await AgentSituationService.getCurrent(task.orgId, 'campaign_manager');
  const prompt = [
    AGENT_REGISTRY.campaign_manager.systemPrompt,
    '',
    `Question: ${task.question}`,
    '',
    task.newsContextSummary ? `Evidence context:\n${task.newsContextSummary}` : '',
    '',
    `Current campaign manager situation (v${currentDoc.version}): ${currentDoc.snapshot.summary || 'empty'}`,
    '',
    'Provide priorities, risks, opportunities, and immediate next actions grounded in evidence.',
  ].join('\n');

  const result = await createCompletion({
    model: task.model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.25,
    maxTokens: 800,
  });
  const content = String(result.content || '').trim();
  const evidenceRefs = extractUrls(content);
  return {
    agentId: 'campaign_manager',
    summary: content,
    confidence: 0.7,
    evidenceRefs,
    patch: {
      summary: content.slice(0, 700),
      risks: content
        .split('\n')
        .filter((l) => /risk/i.test(l))
        .map((l) => l.replace(/^-+\s*/, '').trim())
        .slice(0, 8),
      opportunities: content
        .split('\n')
        .filter((l) => /opportunit/i.test(l))
        .map((l) => l.replace(/^-+\s*/, '').trim())
        .slice(0, 8),
      nextActions: content
        .split('\n')
        .filter((l) => l.trim().startsWith('-') || /^\d+\./.test(l.trim()))
        .map((l) => l.replace(/^(\d+\.)?\s*-?\s*/, '').trim())
        .slice(0, 10),
      evidenceRefs,
    },
  };
}

async function runSpecialist(agentId: AgentId, task: AgentTaskEnvelope): Promise<AgentResult> {
  if (agentId === 'news') return runNewsAgent(task);
  if (agentId === 'campaign_manager') return runCampaignManagerAgent(task);
  throw new Error(`Unsupported specialist agent: ${agentId}`);
}

export interface OrchestrateAgentsInput {
  traceId: string;
  orgId: number;
  userId: string;
  question: string;
  model: string;
  recentMessages: Array<{ role: 'user' | 'agent'; content: string }>;
  memoryContext?: string;
  newsContextSummary?: string;
  latencyBudgetMs?: number;
}

export interface OrchestrateAgentsOutput {
  usedAgents: AgentId[];
  results: AgentResult[];
  finalAnswer: string;
  decision: PlannerDecision;
  situationVersions: Array<{ agentId: AgentId; version: number }>;
}

export async function orchestrateWithPlanner(input: OrchestrateAgentsInput): Promise<OrchestrateAgentsOutput | null> {
  const decision = pickPlannerDecision(input.question);
  if (!decision.useMultiAgent) return null;
  const startedAt = Date.now();
  const latencyBudgetMs = Math.max(1000, input.latencyBudgetMs || 9000);

  const taskBase: AgentTaskEnvelope = {
    traceId: input.traceId,
    orgId: input.orgId,
    userId: input.userId,
    question: input.question,
    model: input.model,
    recentMessages: input.recentMessages || [],
    memoryContext: input.memoryContext,
    newsContextSummary: input.newsContextSummary,
    maxDepth: decision.maxDepth,
    depth: 0,
  };

  const results: AgentResult[] = [];
  const situationVersions: Array<{ agentId: AgentId; version: number }> = [];
  const queue: Array<{ agentId: AgentId; subQuestion: string; depth: number }> = decision.selectedAgents.map((agentId) => ({
    agentId,
    subQuestion: input.question,
    depth: 0,
  }));

  while (queue.length) {
    if (Date.now() - startedAt > latencyBudgetMs) break;
    const current = queue.shift()!;
    if (current.depth >= taskBase.maxDepth) continue;
    const result = await runSpecialist(current.agentId, {
      ...taskBase,
      question: current.subQuestion,
      depth: current.depth,
    });
    results.push(result);

    const committed = await AgentSituationService.commitUpdate({
      orgId: input.orgId,
      agentId: result.agentId,
      changedByAgent: 'planner',
      traceId: input.traceId,
      patch: result.patch,
      changeSummary: `Planner commit for ${result.agentId}`,
    });
    situationVersions.push({ agentId: result.agentId, version: committed.version });

    if (result.requiresFrom && current.depth + 1 < taskBase.maxDepth) {
      queue.push({
        agentId: result.requiresFrom.requiresFrom,
        subQuestion: result.requiresFrom.subQuestion,
        depth: current.depth + 1,
      });
    }
  }

  const mergedSummary = results
    .map((r) => `### ${AGENT_REGISTRY[r.agentId].displayName}\n${r.summary}`)
    .join('\n\n');
  const mergePrompt = [
    AGENT_REGISTRY.planner.systemPrompt,
    '',
    `User question: ${input.question}`,
    '',
    'Specialist outputs:',
    mergedSummary,
    '',
    'Produce one coherent final answer. Remove overlap. Keep it practical and concise.',
  ].join('\n');

  const merged = await createCompletion({
    model: input.model,
    messages: [{ role: 'user', content: mergePrompt }],
    temperature: 0.2,
    maxTokens: 1200,
  });

  const finalAnswerText = String(merged.content || '').trim();
  const finalAnswer =
    Date.now() - startedAt > latencyBudgetMs
      ? `${finalAnswerText}\n\n_Note: partial multi-agent synthesis returned due to latency budget._`
      : finalAnswerText;

  return {
    usedAgents: Array.from(new Set(results.map((r) => r.agentId))),
    results,
    finalAnswer,
    decision,
    situationVersions,
  };
}
