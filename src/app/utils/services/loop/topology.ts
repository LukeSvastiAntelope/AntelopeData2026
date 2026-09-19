/**
 * H3 — Fixed agent topology (read-only map).
 * Not a workflow-authoring canvas: nodes and edges are code constants.
 */

import type { AgentId } from '@/app/utils/services/agent-situation-service';

export type TopologyRole =
  | 'core'
  | 'situation'
  | 'feeder'
  | 'executor'
  | 'human_gate';

export type TopologyZone = 'auto' | 'gate' | 'approval';

export type TopologyNodeDef = {
  id: string;
  label: string;
  role: TopologyRole;
  zone: TopologyZone;
  /** Situation doc agent when applicable */
  situationAgentId?: AgentId;
  /** Scheduler trigger agentId (wired to /api/admin/scheduler/trigger/[agentId]) */
  triggerAgentId?: string;
  description: string;
  /** Grid placement (1-based CSS grid) */
  col: number;
  row: number;
};

export type TopologyEdgeDef = {
  from: string;
  to: string;
  label?: string;
};

/**
 * Reconciled harness topology — consultant at the core, feeders above,
 * executors beside, human gate as the checkpoint into the approval zone.
 */
export const AGENT_TOPOLOGY_NODES: TopologyNodeDef[] = [
  {
    id: 'news',
    label: 'News',
    role: 'feeder',
    zone: 'auto',
    situationAgentId: 'news',
    triggerAgentId: 'news',
    description: 'Campaign news feeder — situation patches from source-grounded synthesis.',
    col: 1,
    row: 1,
  },
  {
    id: 'analytics',
    label: 'Analytics',
    role: 'feeder',
    zone: 'auto',
    situationAgentId: 'campaign_consultant',
    triggerAgentId: 'analytics',
    description: 'Survey analytics / postable-insight write-back (H1 conviction findings).',
    col: 2,
    row: 1,
  },
  {
    id: 'research',
    label: 'Research',
    role: 'feeder',
    zone: 'auto',
    situationAgentId: 'news',
    triggerAgentId: 'research',
    description: 'Research feeder — district / brief context into the situation spine.',
    col: 3,
    row: 1,
  },
  {
    id: 'situation',
    label: 'Situation',
    role: 'situation',
    zone: 'auto',
    situationAgentId: 'campaign_consultant',
    triggerAgentId: 'campaign_consultant',
    description: 'Living situation snapshot — findings, directives, loop metadata.',
    col: 2,
    row: 2,
  },
  {
    id: 'planner',
    label: 'Planner',
    role: 'executor',
    zone: 'auto',
    situationAgentId: 'planner',
    triggerAgentId: 'planner',
    description: 'Planner executor — routes specialists and merges outputs.',
    col: 1,
    row: 3,
  },
  {
    id: 'campaign_consultant',
    label: 'Consultant',
    role: 'core',
    zone: 'auto',
    situationAgentId: 'campaign_consultant',
    triggerAgentId: 'campaign_consultant',
    description: 'Core intake agent + loop proposer command point.',
    col: 2,
    row: 3,
  },
  {
    id: 'campaign_manager',
    label: 'Campaign Mgr',
    role: 'executor',
    zone: 'auto',
    situationAgentId: 'campaign_manager',
    triggerAgentId: 'campaign_manager',
    description: 'Campaign manager executor — risks, opportunities, priorities.',
    col: 3,
    row: 3,
  },
  {
    id: 'human_gate',
    label: 'Human gate',
    role: 'human_gate',
    zone: 'gate',
    description:
      'Checkpoint — approval-risk tools never auto-run. Autonomy cannot promote send.',
    col: 2,
    row: 4,
  },
];

export const AGENT_TOPOLOGY_EDGES: TopologyEdgeDef[] = [
  { from: 'news', to: 'situation', label: 'feed' },
  { from: 'analytics', to: 'situation', label: 'write-back' },
  { from: 'research', to: 'situation', label: 'feed' },
  { from: 'situation', to: 'campaign_consultant', label: 'context' },
  { from: 'planner', to: 'campaign_consultant', label: 'route' },
  { from: 'campaign_manager', to: 'campaign_consultant', label: 'priorities' },
  { from: 'campaign_consultant', to: 'human_gate', label: 'stage' },
];

export const NEXT_SCHEDULED_HINT = 'Daily 2:00 AM America/New_York (platform cron)';
