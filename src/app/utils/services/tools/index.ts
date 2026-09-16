/**
 * Shared campaign tool registry (Phase 2A).
 *
 * Single source of callable stage capabilities for:
 * - Campaign Consultant Expert Agent
 * - Auto-Post agent
 * - Future MCP server
 *
 * Risk is fixed on each tool descriptor. The executor enforces approval;
 * models cannot promote an approval tool to auto-execute.
 */

export type {
  CampaignTool,
  CampaignToolName,
  ExecuteToolOptions,
  ToolCallRequest,
  ToolContext,
  ToolExecutionResult,
  ToolExecutionStatus,
  ToolHandlerResult,
  ToolInputSchema,
  ToolRisk,
} from './types';

export {
  TOOL_REGISTRY,
  AUTO_TOOLS,
  APPROVAL_TOOLS,
  getTool,
  listTools,
  listToolDescriptorsForModel,
  getToolsByRisk,
  assertRegistryRiskIntegrity,
} from './registry';

export { executeTool, executeApprovedTool } from './executor';

export { createSurveyDraftTool } from './create-survey-draft';
