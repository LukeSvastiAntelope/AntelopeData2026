/**
 * read_propensity — funnel / who-to-work / tier summary (risk: auto).
 * P4: tool data is Orchestrator-quarantined (blended + tier only — never priorP0).
 */

import { PropensityRepo } from '@/app/utils/database/propensity-repo';
import { getDecayK } from '@/app/utils/propensity/config';
import {
  assertNoRawPriorInDecision,
  toOrchestratorPropensity,
} from '@/app/utils/propensity/quarantine';
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
    'Read the campaign propensity funnel (hot / warm / cold) and optionally the “who to work next” ranked list. Returns blended propensity + tier only — never the raw prior. Supports Area A + not-DNC via includeAreas / excludeSuppressed.',
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

    const mapRow = (v: (typeof voters)[number]) => {
      const view = toOrchestratorPropensity({
        blended: v.propensity,
        priorWeight: v.prior_weight,
        confidence: v.confidence,
        tier: v.tier,
        evidenceE: v.evidence_e,
        phase: 'p4_tier',
      });
      return {
        personRecordId: v.person_record_id,
        label: v.label,
        party: v.party,
        lat: v.latitude,
        lng: v.longitude,
        ...view,
      };
    };

    const data = {
      decayK: getDecayK(),
      summary: {
        hot: summary.hot,
        warm: summary.warm,
        cold: summary.cold,
        total: summary.total,
        avgPropensity: summary.avgPropensity,
        avgConfidence: summary.avgConfidence,
        estimated: summary.estimated,
        confirmed: summary.confirmed,
        decayK: summary.decayK,
      },
      whoToWork: whoToWork.map(mapRow),
      voters: voters.map(mapRow),
    };

    // Tripwire: never leak raw prior into Orchestrator tool data
    assertNoRawPriorInDecision(data, 'read_propensity.data');

    const workLines = whoToWork
      .slice(0, 15)
      .map((v, i) => {
        const view = toOrchestratorPropensity({
          blended: v.propensity,
          priorWeight: v.prior_weight,
          confidence: v.confidence,
          tier: v.tier,
          evidenceE: v.evidence_e,
          phase: 'p4_tier',
        });
        return `${i + 1}. ${v.label || `person#${v.person_record_id}`} · ${view.tier} · P=${view.blended.toFixed(2)} · ${view.signal} · w=${view.priorWeight.toFixed(2)}`;
      })
      .join('\n');

    return {
      summary: [
        '### Propensity funnel (Orchestrator view — blended only)',
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
        '_Quarantine: blended + tier only. Raw prior p0 is never returned to the decision loop._',
      ].join('\n'),
      data,
    };
  },
};
