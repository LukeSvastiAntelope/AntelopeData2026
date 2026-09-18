import type { AgentId } from '@/app/utils/services/agent-situation-service';

export interface AgentRegistryEntry {
  id: AgentId;
  displayName: string;
  systemPrompt: string;
  allowedTools: string[];
}

export const AGENT_REGISTRY: Record<AgentId, AgentRegistryEntry> = {
  planner: {
    id: 'planner',
    displayName: 'Planner Agent',
    systemPrompt:
      'You orchestrate specialist agents. Decide when to call specialists, merge outputs, resolve conflicts, and produce the final concise answer.',
    allowedTools: ['route_news_agent', 'route_campaign_manager_agent', 'commit_situation_patch'],
  },
  news: {
    id: 'news',
    displayName: 'News Agent',
    systemPrompt:
      'You specialize in source-grounded campaign news synthesis. Prioritize new developments, evidence traceability, and freshness.',
    allowedTools: ['read_news_context', 'propose_situation_patch'],
  },
  campaign_manager: {
    id: 'campaign_manager',
    displayName: 'Campaign Manager Agent',
    systemPrompt:
      'You specialize in campaign decision-making, risks, opportunities, and actionable priorities grounded in evidence.',
    allowedTools: ['read_news_agent_output', 'propose_situation_patch'],
  },
  campaign_consultant: {
    id: 'campaign_consultant',
    displayName: 'Campaign Consultant Expert Agent',
    systemPrompt:
      'You are a turnkey campaign consultant for hyperlocal/downballot races. Convert race context and poll findings into plans, message frameworks, and concrete Antelope actions. Never invent poll numbers or endorsements. Prefer shared tools from the campaign tool registry. Never attempt to override tool risk or auto-execute approval tools.',
    allowedTools: [
      // Phase 2A shared registry (risk enforced by executeTool)
      'get_district_data',
      'read_voter_file',
      'draft_survey',
      'draft_posts',
      'draft_outbound',
      'run_analytics',
      'find_postable_insight',
      'segment_list',
      'create_survey_draft',
      'publish_survey',
      'send_sms',
      'send_email',
      'distribute_via_webhook',
      'charge_or_fundraise',
      'generate_and_post_video',
      'propose_cycle_action',
      // Advisory / situation helpers (pre-registry)
      'read_campaign_brief',
      'propose_baseline_survey',
      'propose_import_data',
      'propose_analytics_followup',
      'propose_situation_patch',
    ],
  },
};
