import {
  filtersFromSegmentId,
  mergeFilters,
  queryTurfAddresses,
  type TurfDefinition,
  type TurfFilters,
} from '@/app/utils/database/turf-repo';
import { getPresetById } from '@/app/utils/voter-segment-presets';
import {
  isTrackedAttributePreset,
  resolveVoterSegment,
  type VoterSegmentDefinition,
} from '@/app/utils/services/voter-segments';
import type { CampaignTool } from './types';

type Input = {
  segmentId?: string;
  filters?: Record<string, unknown>;
  /** MT1: ad-hoc live definition (map + tracked attributes) */
  definition?: VoterSegmentDefinition;
  listId?: number;
  includeAreas?: string[];
  excludeAreas?: string[];
  excludeSuppressed?: boolean;
  excludeContacted?: boolean;
  limit?: number;
  /**
   * Force person_records + tracked resolve (default: auto when preset/definition
   * has tracked attrs or demographic map filters).
   */
  mode?: 'auto' | 'tracked' | 'turf';
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

function shouldUseTrackedPath(input: Input): boolean {
  if (input.mode === 'tracked') return true;
  if (input.mode === 'turf') return false;
  if (input.definition && Object.keys(input.definition).length) return true;
  if (input.segmentId && isTrackedAttributePreset(input.segmentId)) return true;
  // Saved segments (unknown preset id) also resolve via tracked path
  if (input.segmentId && !getPresetById(input.segmentId)) return true;
  return false;
}

/**
 * segment_list — materialize a filtered voter list.
 *
 * MT1: when the segment is defined by map + tracked attributes, resolves a
 * *live* person_records set via queryVoters (recomputed). Legacy party/turnout
 * presets still use the turf/voter_geo spatial path.
 */
export const segmentListTool: CampaignTool<Input> = {
  name: 'segment_list',
  description:
    'Resolve a live voter segment from observed map + survey-stated attributes (never persuasion scores). Use before draft_outbound when the candidate names an audience (e.g. women 35+ public security). Returns membership for message-tailoring context — not a send list. Tracked presets resolve via person records + voter-state; legacy party/turnout presets use turf/geo.',
  inputSchema: {
    type: 'object',
    properties: {
      segmentId: {
        type: 'string',
        description:
          'Preset or saved segment id (e.g. women-35-homeowners-public-security, observed-donors, likely-dem)',
      },
      filters: {
        type: 'object',
        description: 'Legacy turf filters: party, minPartisanScore, zip, …',
      },
      definition: {
        type: 'object',
        description:
          'MT1 live definition: gender, minAgeYears, ownerOccupied, tracked[], hasDonated, …',
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
      mode: {
        type: 'string',
        enum: ['auto', 'tracked', 'turf'],
      },
    },
    additionalProperties: false,
  },
  risk: 'auto',
  async execute(input, ctx) {
    if (!ctx.organizationId) throw new Error('organizationId required in tool context');

    if (shouldUseTrackedPath(input)) {
      const def: VoterSegmentDefinition = {
        ...(input.definition || {}),
        includeFenceLabels: input.includeAreas ?? input.definition?.includeFenceLabels,
        excludeFenceLabels: input.excludeAreas ?? input.definition?.excludeFenceLabels,
        excludeSuppressed:
          input.excludeSuppressed !== undefined
            ? input.excludeSuppressed
            : input.definition?.excludeSuppressed,
        limit: input.limit ?? input.definition?.limit,
      };

      const resolved = await resolveVoterSegment({
        organizationId: ctx.organizationId,
        segmentId: input.segmentId,
        definition: Object.keys(def).length ? def : undefined,
        limit: input.limit,
      });

      const preview = resolved.people
        .slice(0, 25)
        .map((h) => {
          const name =
            [h.person.first_name, h.person.last_name].filter(Boolean).join(' ') ||
            `person #${h.personId}`;
          const matched = h.matchedAttributes
            .slice(0, 2)
            .map((a) => `${a.label}=${a.current}`)
            .join('; ');
          return `- ${name}${matched ? ` · ${matched}` : ''}`;
        })
        .join('\n');

      return {
        summary: [
          `### Segment list (live tracked attributes)`,
          '',
          `- Segment: ${resolved.name} (\`${resolved.id}\`, ${resolved.source})`,
          `- Count: ${resolved.count} (from ${resolved.candidateCount} map candidates)`,
          `- ${resolved.disclaimer}`,
          '',
          preview || '_No matching person records._',
          resolved.count > 25 ? `\n_…and ${resolved.count - 25} more_` : '',
        ]
          .filter(Boolean)
          .join('\n'),
        data: {
          implemented: true,
          mode: 'tracked',
          segmentId: resolved.id,
          segmentName: resolved.name,
          source: resolved.source,
          listId: input.listId ?? null,
          count: resolved.count,
          candidateCount: resolved.candidateCount,
          definition: resolved.definition,
          disclaimer: resolved.disclaimer,
          people: resolved.people.map((h) => ({
            personId: h.personId,
            firstName: h.person.first_name,
            lastName: h.person.last_name,
            email: h.person.email,
            phone: h.person.phone,
            gender: h.person.gender,
            ageYears: h.person.age_years,
            party: h.person.canvass_party || h.person.party,
            ownerOccupied: h.person.owner_occupied,
            zip: h.person.zip,
            latitude: h.person.latitude,
            longitude: h.person.longitude,
            matchedAttributes: h.matchedAttributes.map((a) => ({
              key: a.key,
              label: a.label,
              current: a.current,
              changeSummary: a.changeSummary,
            })),
          })),
        },
      };
    }

    // Legacy turf / voter_geo path
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
        mode: 'turf',
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
