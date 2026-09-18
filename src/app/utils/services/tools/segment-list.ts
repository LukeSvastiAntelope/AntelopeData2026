import {
  filtersFromSegmentId,
  mergeFilters,
  queryTurfAddresses,
  type TurfDefinition,
  type TurfFilters,
} from '@/app/utils/database/turf-repo';
import { getPresetById } from '@/app/utils/voter-segment-presets';
import type { CampaignTool } from './types';

type Input = {
  segmentId?: string;
  filters?: Record<string, unknown>;
  listId?: number;
  includeAreas?: string[];
  excludeAreas?: string[];
  excludeSuppressed?: boolean;
  excludeContacted?: boolean;
  limit?: number;
};

function filtersFromAdHoc(raw: Record<string, unknown> | undefined): TurfFilters {
  if (!raw) return {};
  const party = raw.party ?? raw.party_affiliation;
  return {
    party: Array.isArray(party)
      ? party.map(String)
      : party
        ? [String(party)]
        : undefined,
    minPartisanScore:
      raw.minPartisanScore != null
        ? Number(raw.minPartisanScore)
        : raw.partisan_score_min != null
          ? Number(raw.partisan_score_min)
          : null,
    maxPartisanScore:
      raw.maxPartisanScore != null
        ? Number(raw.maxPartisanScore)
        : raw.partisan_score_max != null
          ? Number(raw.partisan_score_max)
          : null,
    minTurnoutScore:
      raw.minTurnoutScore != null
        ? Number(raw.minTurnoutScore)
        : raw.turnout_score_min != null
          ? Number(raw.turnout_score_min)
          : null,
    maxTurnoutScore:
      raw.maxTurnoutScore != null
        ? Number(raw.maxTurnoutScore)
        : raw.turnout_score_max != null
          ? Number(raw.turnout_score_max)
          : null,
    zip: Array.isArray(raw.zip) ? raw.zip.map(String) : undefined,
  };
}

/**
 * segment_list — materialize a filtered voter/address list (G2).
 * Uses the same layered turf query as build_turf (without saving).
 */
export const segmentListTool: CampaignTool<Input> = {
  name: 'segment_list',
  description:
    'Build a segmented voter/address list from a preset (e.g. likely-dem), ad-hoc filters, and optional geofence include/exclude. Subtracts do-not-contact by default. Returns addresses from voter_geo via the spatial turf query — does not fabricate lists.',
  inputSchema: {
    type: 'object',
    properties: {
      segmentId: {
        type: 'string',
        description: 'Preset id: likely-dem, base-democrats, likely-voters, swing-voters, …',
      },
      filters: {
        type: 'object',
        description: 'Ad-hoc filters: party, minPartisanScore, maxTurnoutScore, zip, …',
      },
      listId: {
        type: 'number',
        description: 'Reserved for contact_list source (ignored if unused).',
      },
      includeAreas: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional saved fence labels to include',
      },
      excludeAreas: {
        type: 'array',
        items: { type: 'string' },
      },
      excludeSuppressed: { type: 'boolean' },
      excludeContacted: { type: 'boolean' },
      limit: { type: 'number' },
    },
    additionalProperties: false,
  },
  risk: 'auto',
  async execute(input, ctx) {
    if (!ctx.organizationId) throw new Error('organizationId required in tool context');

    const preset = input.segmentId ? getPresetById(input.segmentId) : undefined;
    const fromSegment = filtersFromSegmentId(input.segmentId);
    const filters = mergeFilters(fromSegment, filtersFromAdHoc(input.filters));

    const definition: TurfDefinition = {
      includeFenceLabels: input.includeAreas,
      excludeFenceLabels: input.excludeAreas,
      filters,
      excludeSuppressed: input.excludeSuppressed !== false,
      excludeContacted: input.excludeContacted === true,
      limit: input.limit || 500,
    };

    const addresses = await queryTurfAddresses(ctx.organizationId, definition);
    const preview = addresses
      .slice(0, 25)
      .map((a) => `- ${a.label}${a.party ? ` · ${a.party}` : ''}`)
      .join('\n');

    return {
      summary: [
        `### Segment list`,
        '',
        `- Preset: ${input.segmentId || '—'} ${preset ? `(${preset.name})` : ''}`,
        `- Include areas: ${(input.includeAreas || []).join(', ') || '—'}`,
        `- Count: ${addresses.length}`,
        `- DNC subtracted: ${definition.excludeSuppressed !== false}`,
        '',
        preview || '_No matching geocoded addresses._',
        addresses.length > 25 ? `\n_…and ${addresses.length - 25} more_` : '',
      ]
        .filter(Boolean)
        .join('\n'),
      data: {
        implemented: true,
        segmentId: input.segmentId ?? null,
        presetName: preset?.name ?? null,
        listId: input.listId ?? null,
        count: addresses.length,
        definition,
        addresses: addresses.map((a) => ({
          voterGeoId: a.voterGeoId,
          voterFileId: a.voterFileId,
          label: a.label,
          party: a.party,
          partisanScore: a.partisanScore,
          turnoutScore: a.turnoutScore,
          zip: a.zip,
          lat: a.latitude,
          lng: a.longitude,
        })),
      },
    };
  },
};
