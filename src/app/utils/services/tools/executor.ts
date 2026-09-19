import { getTool } from './registry';
import type {
  ExecuteToolOptions,
  ToolCallRequest,
  ToolContext,
  ToolExecutionResult,
  ToolRisk,
} from './types';
import { stripRawPriorFromPayload } from '@/app/utils/propensity/quarantine';

/**
 * Strip any model-supplied attempt to override execution policy.
 * Risk and approval are NEVER taken from tool arguments.
 */
function sanitizeInput(raw: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return {};
  const {
    risk: _risk,
    approved: _approved,
    autoExecute: _autoExecute,
    skipApproval: _skipApproval,
    forceAuto: _forceAuto,
    ...safe
  } = raw as Record<string, unknown>;
  return safe;
}

/**
 * Execute a shared campaign tool.
 *
 * Hard rule: `risk` comes only from the registry descriptor.
 * Approval tools never run unless `options.approved === true` is set by a
 * human-confirmation path. The agent cannot promote approval → auto.
 */
export async function executeTool(
  call: ToolCallRequest,
  ctx: ToolContext,
  options: ExecuteToolOptions = {}
): Promise<ToolExecutionResult> {
  const name = String(call?.name || '').trim();
  if (!name) {
    return {
      ok: false,
      status: 'not_found',
      summary: 'No tool name provided.',
      errorCode: 'missing_tool_name',
    };
  }

  const tool = getTool(name);
  if (!tool) {
    return {
      ok: false,
      status: 'not_found',
      tool: name,
      summary: `Unknown tool \`${name}\`.`,
      errorCode: 'unknown_tool',
    };
  }

  // Authoritative risk — ignore anything the caller/model might invent.
  const risk: ToolRisk = tool.risk;
  const input = sanitizeInput(call.input);

  // Human approval flag comes ONLY from options, never from tool input.
  const humanApproved = options.approved === true;

  if (risk === 'approval' && !humanApproved) {
    return {
      ok: true,
      status: 'pending_approval',
      tool: tool.name,
      risk: 'approval',
      summary: [
        `### Approval required: \`${tool.name}\``,
        '',
        tool.description,
        '',
        'This action is public, irreversible, or spends money. A human must confirm before it runs.',
        'The consultant cannot auto-execute this tool.',
      ].join('\n'),
      staged: {
        input,
        description: tool.description,
      },
    };
  }

  try {
    const result = await tool.execute(input, ctx);
    return {
      ok: true,
      status: 'executed',
      tool: tool.name,
      risk,
      summary: result.summary,
      // P4: quarantine raw prior out of every tool payload before Orchestrator reads it
      data: result.data ? stripRawPriorFromPayload(result.data) : undefined,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const isValidation =
      /required|must be|invalid|at least one/i.test(message) ||
      message.toLowerCase().includes('validation');

    return {
      ok: false,
      status: isValidation ? 'validation_error' : 'error',
      tool: tool.name,
      risk,
      summary: `Tool \`${tool.name}\` failed: ${message}`,
      errorCode: isValidation ? 'validation_error' : 'execution_error',
    };
  }
}

/**
 * Confirm a previously staged approval tool. Same as executeTool with approved:true.
 * Kept as a named entry point so UI/API layers never "accidentally" pass approved
 * on the generic path without intent.
 */
export async function executeApprovedTool(
  call: ToolCallRequest,
  ctx: ToolContext
): Promise<ToolExecutionResult> {
  const tool = getTool(String(call?.name || ''));
  if (!tool) {
    return {
      ok: false,
      status: 'not_found',
      tool: call?.name,
      summary: `Unknown tool \`${call?.name}\`.`,
      errorCode: 'unknown_tool',
    };
  }
  if (tool.risk !== 'approval') {
    // Still allow running auto tools through this path, but do not treat as escalation.
    return executeTool(call, ctx, { approved: false });
  }
  return executeTool(call, ctx, { approved: true });
}
