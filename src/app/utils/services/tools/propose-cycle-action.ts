/**
 * H2 approval tool: stage a loop cycle recommendation at the human gate.
 * Execute (after Approve) records endorsement only — never publish/send/spend.
 */

import {
  AgentSituationService,
} from '@/app/utils/services/agent-situation-service';
import type { CampaignTool } from './types';

type Input = {
  action: 'improved_survey' | 'iterate' | 'pivot' | 'hold';
  surveyId?: number;
  topic?: string;
  rationale?: string;
  reasoningTrace?: string;
  triggers?: string[];
};

const ACTIONS = new Set(['improved_survey', 'iterate', 'pivot', 'hold']);

export const proposeCycleActionTool: CampaignTool<Input> = {
  name: 'propose_cycle_action',
  description:
    'Stage a campaign-loop recommendation (improved survey / iterate / pivot / hold) for human review. Requires approval. Does not publish, send, or spend — endorsement only.',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: 'improved_survey | iterate | pivot | hold',
      },
      surveyId: { type: 'number', description: 'Focus survey id when known' },
      topic: { type: 'string', description: 'Topic / steering focus' },
      rationale: { type: 'string', description: 'Short why-this recommendation' },
      reasoningTrace: {
        type: 'string',
        description: 'what I saw → why this audit trail',
      },
      triggers: {
        type: 'array',
        items: { type: 'string' },
        description: 'Trigger names that fired this pass',
      },
    },
    required: ['action'],
    additionalProperties: false,
  },
  risk: 'approval',
  async execute(input, ctx) {
    const action = String(input.action || '').trim();
    if (!ACTIONS.has(action)) {
      throw new Error(
        `action must be one of ${Array.from(ACTIONS).join(', ')}`
      );
    }
    const orgId = ctx.organizationId != null ? Number(ctx.organizationId) : 0;
    const rationale = String(input.rationale || '').trim();
    const topic = String(input.topic || '').trim();
    const reasoningTrace = String(input.reasoningTrace || '').trim();
    const surveyId =
      input.surveyId != null && Number.isFinite(Number(input.surveyId))
        ? Number(input.surveyId)
        : null;

    // Human approved the *direction* — record endorsement. No world-touching side effects.
    if (orgId > 0) {
      const current = await AgentSituationService.getCurrent(
        orgId,
        'campaign_consultant'
      );
      await AgentSituationService.commitUpdate({
        orgId,
        agentId: 'campaign_consultant',
        changedByAgent: 'campaign_consultant',
        traceId: `loop-endorsed-${Date.now()}`,
        changeSummary: `Human endorsed loop action: ${action}`,
        patch: {
          summary: [
            current.snapshot.summary,
            `Human endorsed: ${action}${topic ? ` (${topic})` : ''}.`,
          ]
            .filter(Boolean)
            .join(' ')
            .slice(0, 2000),
          nextActions: [
            `Endorsed ${action}${surveyId ? ` for survey ${surveyId}` : ''}${topic ? ` — ${topic}` : ''}. Ready for follow-on draft tools; publish/send still require their own approval.`,
            ...(current.snapshot.nextActions || []),
          ],
          opportunities:
            action !== 'hold'
              ? [
                  `Endorsed cycle action: ${action}${rationale ? ` — ${rationale}` : ''}`,
                  ...(current.snapshot.opportunities || []),
                ]
              : current.snapshot.opportunities,
          loopMeta: {
            ...(current.snapshot.loopMeta || {}),
            lastAction: action as
              | 'improved_survey'
              | 'iterate'
              | 'pivot'
              | 'hold',
            lastReasoningTrace:
              reasoningTrace || current.snapshot.loopMeta?.lastReasoningTrace,
          },
        },
      });
    }

    return {
      summary: [
        `### Loop recommendation endorsed: ${action}`,
        rationale || 'No rationale provided.',
        topic ? `Topic focus: ${topic}` : null,
        surveyId ? `Focus survey: #${surveyId}` : null,
        '',
        'No survey was published and nothing was sent. Use draft/create tools next; publish_survey / send_* still require their own approval cards.',
        reasoningTrace ? `\nReasoning trace:\n${reasoningTrace}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
      data: {
        action,
        surveyId,
        topic,
        rationale,
        endorsed: true,
        worldTouching: false,
        triggers: Array.isArray(input.triggers) ? input.triggers : [],
      },
    };
  },
};
