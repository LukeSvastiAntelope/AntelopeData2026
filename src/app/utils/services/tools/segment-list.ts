import type { CampaignTool } from './types';

type Input = {
  segmentId?: string;
  filters?: Record<string, unknown>;
  listId?: number;
};

/**
 * Stub — building an executable segmented contact list is not a single service yet.
 * Presets exist in voter-segment-presets, but applying them to a live list is unfinished.
 */
export const segmentListTool: CampaignTool<Input> = {
  name: 'segment_list',
  description:
    'Build or return a segmented voter/contact list from filters or presets. Not implemented yet — returns not-implemented rather than fabricating a list.',
  inputSchema: {
    type: 'object',
    properties: {
      segmentId: {
        type: 'string',
        description: 'Optional preset id (e.g. likely-voters). Informational only until implemented.',
      },
      filters: {
        type: 'object',
        description: 'Optional ad-hoc filters (not applied yet).',
      },
      listId: {
        type: 'number',
        description: 'Optional source contact list id (not applied yet).',
      },
    },
    additionalProperties: false,
  },
  risk: 'auto',
  async execute(input) {
    return {
      summary:
        'Not implemented: `segment_list` cannot yet materialize a filtered contact list. Do not invent counts or recipients. Voter segment presets exist in the product UI, but this callable tool is still a stub.',
      data: {
        implemented: false,
        reason:
          'No single segment-then-return-list service; presets and contact lists are separate surfaces.',
        requested: {
          segmentId: input.segmentId ?? null,
          listId: input.listId ?? null,
          filters: input.filters ?? null,
        },
      },
    };
  },
};
