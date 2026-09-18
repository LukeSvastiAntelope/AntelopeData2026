import type { CampaignTool, CampaignToolName, ToolRisk } from './types';
import { getDistrictDataTool } from './get-district-data';
import { readVoterFileTool } from './read-voter-file';
import { draftSurveyTool } from './draft-survey';
import { draftPostsTool } from './draft-posts';
import { draftOutboundTool } from './draft-outbound';
import { runAnalyticsTool } from './run-analytics';
import { segmentListTool } from './segment-list';
import { createSurveyDraftTool } from './create-survey-draft';
import { publishSurveyTool } from './publish-survey';
import { sendSmsTool } from './send-sms';
import { sendEmailTool } from './send-email';
import { distributeViaWebhookTool } from './distribute-via-webhook';
import { chargeOrFundraiseTool } from './charge-or-fundraise';
import { generateAndPostVideoTool } from './generate-and-post-video';
import { findPostableInsightTool } from './find-postable-insight';
import { proposeCycleActionTool } from './propose-cycle-action';

/**
 * Canonical shared tool registry.
 * Risk flags here are authoritative — the executor never trusts caller/model risk.
 */
export const TOOL_REGISTRY: Record<CampaignToolName, CampaignTool> = {
  get_district_data: getDistrictDataTool,
  read_voter_file: readVoterFileTool,
  draft_survey: draftSurveyTool,
  draft_posts: draftPostsTool,
  draft_outbound: draftOutboundTool,
  run_analytics: runAnalyticsTool,
  find_postable_insight: findPostableInsightTool,
  segment_list: segmentListTool,
  create_survey_draft: createSurveyDraftTool,
  publish_survey: publishSurveyTool,
  send_sms: sendSmsTool,
  send_email: sendEmailTool,
  distribute_via_webhook: distributeViaWebhookTool,
  charge_or_fundraise: chargeOrFundraiseTool,
  generate_and_post_video: generateAndPostVideoTool,
  propose_cycle_action: proposeCycleActionTool,
};

const AUTO_TOOLS: CampaignToolName[] = [
  'get_district_data',
  'read_voter_file',
  'draft_survey',
  'draft_posts',
  'draft_outbound',
  'run_analytics',
  'find_postable_insight',
  'segment_list',
  'create_survey_draft',
];

const APPROVAL_TOOLS: CampaignToolName[] = [
  'publish_survey',
  'send_sms',
  'send_email',
  'distribute_via_webhook',
  'charge_or_fundraise',
  'generate_and_post_video',
  'propose_cycle_action',
];

export function getTool(name: string): CampaignTool | undefined {
  return TOOL_REGISTRY[name as CampaignToolName];
}

export function listTools(filter?: { risk?: ToolRisk }): CampaignTool[] {
  return Object.values(TOOL_REGISTRY).filter((t) =>
    filter?.risk ? t.risk === filter.risk : true
  );
}

/** OpenAI/Anthropic-compatible tool descriptors (name/description/parameters only — no risk leak to model as overridable). */
export function listToolDescriptorsForModel(filter?: { risk?: ToolRisk }) {
  return listTools(filter).map((t) => ({
    name: t.name,
    description: `${t.description} [risk=${t.risk}]`,
    inputSchema: t.inputSchema,
    /** Informational only — executor ignores any model attempt to change this. */
    risk: t.risk,
  }));
}

export function getToolsByRisk(risk: ToolRisk): CampaignTool[] {
  return listTools({ risk });
}

/** Dev/assert helper: registry risk must match the Phase 2A allowlists. */
export function assertRegistryRiskIntegrity(): void {
  for (const name of AUTO_TOOLS) {
    if (TOOL_REGISTRY[name].risk !== 'auto') {
      throw new Error(`Tool ${name} must have risk 'auto'`);
    }
  }
  for (const name of APPROVAL_TOOLS) {
    if (TOOL_REGISTRY[name].risk !== 'approval') {
      throw new Error(`Tool ${name} must have risk 'approval'`);
    }
  }
}

export { AUTO_TOOLS, APPROVAL_TOOLS };
