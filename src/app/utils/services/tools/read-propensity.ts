import { PropensityRepo } from '@/app/utils/database/propensity-repo';
import { getDecayK } from '@/app/utils/propensity/config';
import type { CampaignTool } from './types';

type Input = {
  tier?: 'hot' | 'warm' | 'cold';
  refresh?: boolean;
  limit?: number;
};

/**
 * read_propensity — funnel / tier summary from the decaying blend (risk: auto).
 * Orchestrator-facing: reports blended propensity only (never raw prior as a target).
 */
export const readPropensityTool: CampaignTool<Input> = {
  name: 'read_propensity',
  description:
    'Read the campaign propensity funnel (hot / warm / cold tiers) from the decaying prior+engagement blend. Optionally refresh the materialized voter_propensity view first. Returns blended values — not a static per-voter score.',
  inputSchema: {
    type: 'object',
    properties: {
      tier: {
        type: 'string',
        enum: ['hot', 'warm', 'cold'],
        description: 'Optional tier filter for the voter list sample',
      },
      refresh: {
        type: 'boolean',
        description: 'If true, recompute voter_propensity from events before reading',
      },
      limit: { type: 'number', description: 'Max voters to sample (default 25)' },
    },
    additionalProperties: false,
  },
  risk: 'auto',
  async execute(input, ctx) {
    if (!ctx.organizationId) throw new Error('organizationId required');

    if (input.refresh) {
      await PropensityRepo.refreshOrganization(ctx.organizationId, { limit: 2000 });
    }

    const summary = await PropensityRepo.funnelSummary(ctx.organizationId);
    const voters = await PropensityRepo.listByOrg(ctx.organizationId, {
      tier: input.tier,
      limit: input.limit || 25,
    });

    const sample = voters
      .slice(0, 15)
      .map(
        (v) =>
          `- ${v.label || `person#${v.person_record_id}`} · P=${v.propensity.toFixed(2)} · ${v.tier} · conf=${v.confidence.toFixed(2)} · w=${v.prior_weight.toFixed(2)}`
      )
      .join('\n');

    return {
      summary: [
        '### Propensity funnel (decaying blend)',
        '',
        `- Decay k: ${summary.decayK} (config: PROPENSITY_DECAY_K)`,
        `- Hot: ${summary.hot} · Warm: ${summary.warm} · Cold: ${summary.cold} · Total: ${summary.total}`,
        summary.avgPropensity != null
          ? `- Avg blended P: ${summary.avgPropensity.toFixed(3)} · avg confidence: ${(summary.avgConfidence ?? 0).toFixed(3)}`
          : '- No materialized rows yet — refresh to populate.',
        '',
        '_Materialized view — recomputed from engagement; prior weight decays as evidence lands._',
        '',
        sample || '_Empty list._',
      ].join('\n'),
      data: {
        decayK: getDecayK(),
        summary,
        voters: voters.map((v) => ({
          personRecordId: v.person_record_id,
          label: v.label,
          // Decision-facing blended value only at top level
          blended: v.propensity,
          confidence: v.confidence,
          tier: v.tier,
          priorWeight: v.prior_weight,
          // Audit
          priorP0: v.p0,
          posteriorQ: v.posterior_q,
          evidenceE: v.evidence_e,
        })),
      },
    };
  },
};
