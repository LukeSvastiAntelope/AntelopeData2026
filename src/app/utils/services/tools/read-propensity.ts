/**
 * read_propensity — funnel / who-to-work / tier summary (risk: auto).
 */

import { PropensityRepo } from '@/app/utils/database/propensity-repo';
import { getDecayK } from '@/app/utils/propensity/config';
import type { CampaignTool } from './types';

type Input = {
  tier?: 'hot' | 'warm' | 'cold';
  refresh?: boolean;
  whoNext?: boolean;
  includeAreas?: string[];
  excludeSuppressed?: boolean;
  limit?: number;
};

export const readPropensityTool: CampaignTool<Input> = {
  name: 'read_propensity',
  description:
    'Read the campaign propensity funnel (hot / warm / cold) and optionally the “who to work next” ranked list. Supports Area A + not-DNC composition via includeAreas and excludeSuppressed. Returns blended values — not a static score.',
  inputSchema: {
    type: 'object',
    properties: {
      tier: {
        type: 'string',
        enum: ['hot', 'warm', 'cold'],
        description: 'Optional tier filter',
      },
      refresh: {
        type: 'boolean',
        description: 'If true, recompute voter_propensity from events before reading',
      },
      whoNext: {
        type: 'boolean',
        description: 'If true, return who-to-work ranking (tier × freshness)',
      },
      includeAreas: {
        type: 'array',
        items: { type: 'string' },
        description: 'Geofence labels e.g. ["Area A"]',
      },
      excludeSuppressed: {
        type: 'boolean',
        description: 'Subtract DNC / contact_suppression (default true when whoNext)',
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
    const listOpts = {
      tier: input.tier,
      includeFenceLabels: input.includeAreas,
      excludeSuppressed: input.excludeSuppressed,
      limit: input.limit || 25,
    };

    const whoNext = input.whoNext !== false;
    const whoToWork = whoNext
      ? await PropensityRepo.whoToWorkNext(ctx.organizationId, {
          ...listOpts,
          excludeSuppressed: input.excludeSuppressed !== false,
        })
      : [];

    const voters = await PropensityRepo.listByOrg(ctx.organizationId, listOpts);

    const workLines = whoToWork
      .slice(0, 15)
      .map(
        (v, i) =>
          `${i + 1}. ${v.label || `person#${v.person_record_id}`} · ${v.tier} · P=${v.propensity.toFixed(2)} · ${v.signal} · w=${v.prior_weight.toFixed(2)}`
      )
      .join('\n');

    return {
      summary: [
        '### Propensity funnel (sales surface)',
        '',
        `- Decay k: ${summary.decayK} (PROPENSITY_DECAY_K)`,
        `- Hot: ${summary.hot} · Warm: ${summary.warm} · Cold: ${summary.cold} · Total: ${summary.total}`,
        `- Estimated: ${summary.estimated} · Confirmed: ${summary.confirmed}`,
        summary.avgPropensity != null
          ? `- Avg blended P: ${summary.avgPropensity.toFixed(3)} · avg confidence: ${(summary.avgConfidence ?? 0).toFixed(3)}`
          : '- No materialized rows yet — refresh to populate.',
        '',
        '### Who to work next',
        workLines || '_Empty — refresh or loosen filters._',
        '',
        '_Compose with Area A + not-DNC via includeAreas / excludeSuppressed. Materialized view — not ballistic._',
      ].join('\n'),
      data: {
        decayK: getDecayK(),
        summary,
        whoToWork: whoToWork.map((v) => ({
          personRecordId: v.person_record_id,
          label: v.label,
          blended: v.propensity,
          confidence: v.confidence,
          tier: v.tier,
          signal: v.signal,
          priorWeight: v.prior_weight,
          party: v.party,
          lat: v.latitude,
          lng: v.longitude,
        })),
        voters: voters.map((v) => ({
          personRecordId: v.person_record_id,
          label: v.label,
          blended: v.propensity,
          confidence: v.confidence,
          tier: v.tier,
          signal: v.signal,
          priorWeight: v.prior_weight,
          priorP0: v.p0,
          posteriorQ: v.posterior_q,
          evidenceE: v.evidence_e,
        })),
      },
    };
  },
};
