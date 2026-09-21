import {
  draftOutboundForSegment,
  OUTBOUND_FORMATS,
  type OutboundFormat,
} from '@/app/utils/services/outbound-draft-service';
import type { VoterSegmentDefinition } from '@/app/utils/services/voter-segments';
import {
  listTrackedSegmentPresets,
  resolveSegmentHint,
} from '@/app/utils/voter-segment-presets';
import type { CampaignTool } from './types';

type Input = {
  segmentId?: string;
  /** Natural-language audience, e.g. "women 35+ public security" */
  audience?: string;
  definition?: VoterSegmentDefinition;
  formats?: string[];
  goal?: string;
  limit?: number;
  /** Smoke / offline: skip LLM */
  mock?: boolean;
};

const TRACKED_PRESET_HINT = listTrackedSegmentPresets()
  .map((p) => `\`${p.id}\``)
  .join(', ');

/**
 * draft_outbound — tailored drafts for a live tracked-attribute segment.
 * Private / reversible (risk: auto). Send stays behind stage_outbound_send /
 * send_sms / send_email (approval) or /outbound Stage for approval.
 */
export const draftOutboundTool: CampaignTool<Input> = {
  name: 'draft_outbound',
  description: [
    'Generate tailored outbound drafts (letter, email, SMS, ad copy) for a live observed-attribute segment.',
    'Example: draft a public-security letter for women 35+ → segmentId `women-35-homeowners-public-security` or audience "women 35 homeowners public security", formats ["letter"].',
    'Uses survey-stated positions only — never invents concerns. Message tailoring only; does not choose who to contact or send.',
    'If unsure of segmentId, call segment_list first or pass audience. Tracked presets:',
    TRACKED_PRESET_HINT + '.',
    'Thin segments get coarse copy + small-sample disclaimer. To send SMS/email afterward, call stage_outbound_send (approval) or use /outbound.',
  ].join(' '),
  inputSchema: {
    type: 'object',
    properties: {
      segmentId: {
        type: 'string',
        description:
          'Preset or saved segment id (e.g. women-35-homeowners-public-security)',
      },
      audience: {
        type: 'string',
        description:
          'Natural-language audience hint when segmentId unknown (e.g. "women 35+ public security")',
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

    const fromAudience = input.audience ? resolveSegmentHint(input.audience) : null;
    const segmentId = input.segmentId || fromAudience || null;
    if (!segmentId && !input.definition) {
      throw new Error(
        'segmentId, audience, or definition is required. Try segment_list or audience e.g. "women 35+ public security".'
      );
    }

    const formats = (input.formats || [])
      .map((f) => String(f).toLowerCase().replace(/-/g, '_') as OutboundFormat)
      .filter((f) => OUTBOUND_FORMATS.includes(f));

    const result = await draftOutboundForSegment({
      organizationId: ctx.organizationId,
      segmentId,
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
          d.smallSampleDisclaimerApplied
            ? '_Small-sample disclaimer baked in (thin segment)._'
            : null,
          '',
          d.body.slice(0, 500) + (d.body.length > 500 ? '…' : ''),
        ]
          .filter(Boolean)
          .join('\n');
      })
      .join('\n\n');

    return {
      summary: [
        `### Tailored outbound drafts`,
        '',
        `- Segment: **${result.context.segmentName}** (\`${result.context.segmentId}\`)`,
        fromAudience && !input.segmentId
          ? `- Resolved audience “${input.audience}” → \`${fromAudience}\``
          : null,
        `- Live voters: ${result.context.voterCount}${
          result.context.thinSegment
            ? ' (thin — coarse tailor + small-sample disclaimer)'
            : ''
        }`,
        `- Model: ${result.modelUsed || 'fallback templates'}${
          result.usedFallback ? ' (fallback)' : ''
        }`,
        `- ${result.context.disclaimer}`,
        '',
        `**Stated positions used:**`,
        posPreview,
        '',
        draftPreview,
        '',
        '_Private draft only. To send SMS/email: `stage_outbound_send` (approval) or /outbound → Stage for approval. Who/when stays with propensity quarantine._',
      ]
        .filter(Boolean)
        .join('\n'),
      data: {
        implemented: true,
        context: result.context,
        drafts: result.drafts,
        modelUsed: result.modelUsed,
        usedFallback: result.usedFallback,
        thinSegment: result.context.thinSegment,
        resolvedFromAudience: fromAudience && !input.segmentId ? fromAudience : null,
        nextStep: 'stage_outbound_send or /outbound Stage for approval',
      },
    };
  },
};
