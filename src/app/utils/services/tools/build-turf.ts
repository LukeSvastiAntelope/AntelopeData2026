import {
  TurfRepo,
  filtersFromSegmentId,
  mergeFilters,
  queryTurfAddresses,
  type TurfDefinition,
  type TurfFilters,
} from '@/app/utils/database/turf-repo';
import type { CampaignTool } from './types';

type Input = {
  label: string;
  includeAreas?: string[];
  excludeAreas?: string[];
  includeFenceIds?: number[];
  excludeFenceIds?: number[];
  segmentId?: string;
  party?: string[];
  /** P3: hot | warm | cold — composable with Area A / not-DNC */
  propensityTier?: Array<'hot' | 'warm' | 'cold'>;
  minPartisanScore?: number;
  maxPartisanScore?: number;
  minTurnoutScore?: number;
  maxTurnoutScore?: number;
  zip?: string[];
  excludeSuppressed?: boolean;
  excludeContacted?: boolean;
  assignedTo?: number;
  notes?: string;
  limit?: number;
  /** If true, only preview the query without saving */
  previewOnly?: boolean;
};

/**
 * build_turf — resolve layered eligibility into a saved named walk-list (risk: auto).
 * Example: Area A ∩ likely-Dem − DNC − already canvassed.
 */
export const buildTurfTool: CampaignTool<Input> = {
  name: 'build_turf',
  description:
    'Build and save a named turf (ordered walk-list). Layers: include fences ∩ filters − exclude fences − do-not-contact − optional already-contacted. Example: includeAreas=["Area A"], propensityTier=["hot"], excludeSuppressed=true.',
  inputSchema: {
    type: 'object',
    properties: {
      label: { type: 'string', description: 'Turf name, e.g. "Saturday Dem walk"' },
      includeAreas: {
        type: 'array',
        items: { type: 'string' },
        description: 'Saved geofence labels to include (OR)',
      },
      excludeAreas: {
        type: 'array',
        items: { type: 'string' },
        description: 'Saved geofence labels to exclude',
      },
      includeFenceIds: { type: 'array', items: { type: 'number' } },
      excludeFenceIds: { type: 'array', items: { type: 'number' } },
      segmentId: {
        type: 'string',
        description: 'Preset shorthand e.g. likely-dem, hot, warm, cold, swing-voters',
      },
      party: { type: 'array', items: { type: 'string' } },
      propensityTier: {
        type: 'array',
        items: { type: 'string', enum: ['hot', 'warm', 'cold'] },
        description: 'P3 propensity tiers — e.g. ["hot"] for hot + Area A + not-DNC',
      },
      minPartisanScore: { type: 'number' },
      maxPartisanScore: { type: 'number' },
      minTurnoutScore: { type: 'number' },
      maxTurnoutScore: { type: 'number' },
      zip: { type: 'array', items: { type: 'string' } },
      excludeSuppressed: {
        type: 'boolean',
        description: 'Subtract contact_suppression (default true)',
      },
      excludeContacted: {
        type: 'boolean',
        description: 'Subtract already-canvassed nearby person_records (default false)',
      },
      assignedTo: { type: 'number' },
      notes: { type: 'string' },
      limit: { type: 'number' },
      previewOnly: { type: 'boolean' },
    },
    required: ['label'],
    additionalProperties: false,
  },
  risk: 'auto',
  async execute(input, ctx) {
    if (!ctx.organizationId) throw new Error('organizationId required in tool context');
    const label = String(input.label || '').trim();
    if (!label) throw new Error('label is required');

    const fromSegment = filtersFromSegmentId(input.segmentId);
    const filters: TurfFilters = mergeFilters(fromSegment, {
      party: input.party,
      propensityTier: input.propensityTier,
      minPartisanScore: input.minPartisanScore,
      maxPartisanScore: input.maxPartisanScore,
      minTurnoutScore: input.minTurnoutScore,
      maxTurnoutScore: input.maxTurnoutScore,
      zip: input.zip,
      segmentId: input.segmentId,
    });

    const definition: TurfDefinition = {
      includeFenceLabels: input.includeAreas,
      excludeFenceLabels: input.excludeAreas,
      includeFenceIds: input.includeFenceIds,
      excludeFenceIds: input.excludeFenceIds,
      filters,
      excludeSuppressed: input.excludeSuppressed !== false,
      excludeContacted: input.excludeContacted === true,
      limit: input.limit || 5000,
    };

    if (input.previewOnly) {
      const addresses = await queryTurfAddresses(ctx.organizationId, definition);
      return {
        summary: `Preview “${label}”: ${addresses.length} addresses (not saved).`,
        data: {
          preview: true,
          label,
          count: addresses.length,
          definition,
          sample: addresses.slice(0, 20).map((a) => ({
            label: a.label,
            party: a.party,
            lat: a.latitude,
            lng: a.longitude,
          })),
        },
      };
    }

    const { turf, addresses } = await TurfRepo.build({
      organizationId: ctx.organizationId,
      createdBy: ctx.userId,
      label,
      definition,
      assignedTo: input.assignedTo ?? null,
      notes: input.notes ?? null,
    });

    const preview = addresses
      .slice(0, 25)
      .map((a) => `- ${a.label}${a.party ? ` · ${a.party}` : ''}`)
      .join('\n');

    return {
      summary: [
        `### Turf “${turf.label}”`,
        '',
        `- Addresses: ${turf.address_count}`,
        `- Include: ${(definition.includeFenceLabels || []).join(', ') || '—'}`,
        `- Exclude fences: ${(definition.excludeFenceLabels || []).join(', ') || '—'}`,
        `- DNC subtracted: ${definition.excludeSuppressed !== false}`,
        `- Already-contacted subtracted: ${!!definition.excludeContacted}`,
        '',
        preview || '_Empty walk-list._',
        addresses.length > 25 ? `\n_…and ${addresses.length - 25} more_` : '',
      ]
        .filter(Boolean)
        .join('\n'),
      data: {
        turfId: turf.id,
        label: turf.label,
        count: turf.address_count,
        definition: turf.definition,
        addresses: addresses.slice(0, 200).map((a) => ({
          voterGeoId: a.voterGeoId,
          label: a.label,
          party: a.party,
          zip: a.zip,
          lat: a.latitude,
          lng: a.longitude,
        })),
      },
    };
  },
};
