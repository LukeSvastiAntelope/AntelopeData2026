import {
  draftOutboundForSegment,
  OUTBOUND_FORMATS,
  type OutboundFormat,
} from '@/app/utils/services/outbound-draft-service';
import type { VoterSegmentDefinition } from '@/app/utils/services/voter-segments';
import type { CampaignTool } from './types';

type Input = {
  segmentId?: string;
  definition?: VoterSegmentDefinition;
  formats?: string[];
  goal?: string;
  limit?: number;
  /** Smoke / offline: skip LLM */
  mock?: boolean;
};

/**
 * draft_outbound — tailored drafts for a live tracked-attribute segment.
 * Uses stated survey positions only; never invents issue concerns.
 */
export const draftOutboundTool: CampaignTool<Input> = {
  name: 'draft_outbound',
  description:
    'Generate tailored outbound drafts (letter, email, SMS, ad copy) for a named segment. Tailoring uses observed map attributes + survey-stated issue positions from voter tracking — never invents a position the segment did not state. Message tailoring only; does not send.',
  inputSchema: {
    type: 'object',
    properties: {
      segmentId: {
        type: 'string',
        description:
          'Preset or saved segment id (e.g. women-35-homeowners-public-security)',
      },
      definition: {
        type: 'object',
        description: 'Optional ad-hoc live segment definition overlay',
      },
      formats: {
        type: 'array',
        items: { type: 'string' },
        description: 'letter | email | sms | ad_copy (default: all)',
      },
      goal: {
        type: 'string',
        description: 'Optional campaign goal / CTA framing',
      },
      limit: {
        type: 'number',
        description: 'Max voters to resolve for aggregation (default 200)',
      },
      mock: {
        type: 'boolean',
        description: 'Skip LLM; use honest template drafts',
      },
    },
    additionalProperties: false,
  },
  risk: 'auto',
  async execute(input, ctx) {
    if (!ctx.organizationId) throw new Error('organizationId required in tool context');
    if (!input.segmentId && !input.definition) {
      throw new Error('segmentId or definition is required');
    }

    const formats = (input.formats || [])
      .map((f) => String(f).toLowerCase().replace(/-/g, '_') as OutboundFormat)
      .filter((f) => OUTBOUND_FORMATS.includes(f));

    const result = await draftOutboundForSegment({
      organizationId: ctx.organizationId,
      segmentId: input.segmentId,
      definition: input.definition,
      formats: formats.length ? formats : undefined,
      goal: input.goal,
      limit: input.limit,
      mock: input.mock === true,
    });

    const posPreview =
      result.context.statedPositions.length > 0
        ? result.context.statedPositions
            .slice(0, 5)
            .map((p) => `- ${p.label}: “${p.value}” (n=${p.count})`)
            .join('\n')
        : '- _(none stated — drafts will not invent issue claims)_';

    const draftPreview = result.drafts
      .map((d) => {
        const ground =
          d.groundedIn.length > 0
            ? d.groundedIn.map((g) => `${g.label}=${g.value}`).join('; ')
            : 'no stated issue (demographic/map only)';
        return [
          `#### ${d.title}`,
          `_Grounded in: ${ground}_`,
          '',
          d.body.slice(0, 500) + (d.body.length > 500 ? '…' : ''),
        ].join('\n');
      })
      .join('\n\n');

    return {
      summary: [
        `### Tailored outbound drafts`,
        '',
        `- Segment: **${result.context.segmentName}** (\`${result.context.segmentId}\`)`,
        `- Live voters: ${result.context.voterCount}`,
        `- Model: ${result.modelUsed || 'fallback templates'}${
          result.usedFallback ? ' (fallback)' : ''
        }`,
        `- ${result.context.disclaimer}`,
        '',
        `**Stated positions used:**`,
        posPreview,
        '',
        draftPreview,
      ].join('\n'),
      data: {
        implemented: true,
        context: result.context,
        drafts: result.drafts,
        modelUsed: result.modelUsed,
        usedFallback: result.usedFallback,
      },
    };
  },
};
