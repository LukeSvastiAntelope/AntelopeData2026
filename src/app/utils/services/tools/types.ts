/**
 * Shared campaign tool contracts.
 *
 * Used by the Campaign Consultant, Auto-Post agent, and (later) MCP.
 * Risk is a fixed property of each tool descriptor — never derived from
 * model output or caller-supplied arguments.
 */

import type { PropensityOrchestratorView } from '@/app/utils/propensity/types';

export type ToolRisk = 'auto' | 'approval';

/** Minimal JSON Schema object shape for tool inputs (no Zod dependency). */
export type ToolInputSchema = {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
};

/**
 * Tool / Orchestrator execution context.
 * P4: optional `propensity` is the quarantine view only (blended + tier) — never raw p0.
 */
export type ToolContext = {
  userId: number;
  organizationId?: number | null;
  /**
   * Blended propensity tier for the active voter / cohort decision, when attached.
   * Must be PropensityOrchestratorView — no prior.p0.
   */
  propensity?: PropensityOrchestratorView | null;
};

/** Result returned by a tool's execute handler after it actually runs. */
export type ToolHandlerResult = {
  summary: string;
  data?: Record<string, unknown>;
};

/**
 * Descriptor every tool must export.
 * `risk` is readonly at the type level; the executor only reads it from the registry.
 */
export type CampaignTool<TInput extends Record<string, unknown> = Record<string, unknown>> = {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: ToolInputSchema;
  readonly risk: ToolRisk;
  execute: (input: TInput, ctx: ToolContext) => Promise<ToolHandlerResult>;
};

/** What an agent may request. Never includes a writable risk override. */
export type ToolCallRequest = {
  name: string;
  input?: Record<string, unknown>;
};

/**
 * Options for the executor. `approved` may ONLY be set by a human-confirmation
 * path (UI / API). Never pass model-suggested approval through here.
 */
export type ExecuteToolOptions = {
  approved?: boolean;
};

export type ToolExecutionStatus =
  | 'executed'
  | 'pending_approval'
  | 'error'
  | 'not_found'
  | 'validation_error';

export type ToolExecutionResult =
  | {
      ok: true;
      status: 'executed';
      tool: string;
      risk: ToolRisk;
      summary: string;
      data?: Record<string, unknown>;
    }
  | {
      ok: true;
      status: 'pending_approval';
      tool: string;
      risk: 'approval';
      summary: string;
      staged: {
        input: Record<string, unknown>;
        description: string;
      };
    }
  | {
      ok: false;
      status: 'error' | 'not_found' | 'validation_error';
      tool?: string;
      risk?: ToolRisk;
      summary: string;
      errorCode: string;
    };

/** Canonical tool name union for registry keys. */
export type CampaignToolName =
  | 'get_district_data'
  | 'read_voter_file'
  | 'draft_survey'
  | 'draft_posts'
  | 'draft_outbound'
  | 'run_analytics'
  | 'find_postable_insight'
  | 'segment_list'
  | 'create_survey_draft'
  | 'publish_survey'
  | 'send_sms'
  | 'send_email'
  | 'distribute_via_webhook'
  | 'charge_or_fundraise'
  | 'generate_and_post_video'
  | 'propose_cycle_action'
  | 'clip_video'
  | 'addresses_in_area'
  | 'build_turf'
  | 'list_turf_addresses'
  | 'assign_turf'
  | 'record_turf_stop'
  | 'read_propensity';
