import { TurfRepo } from '@/app/utils/database/turf-repo';
import type { CampaignTool } from './types';

type Input = {
  turf?: string;
  turfId?: number;
  limit?: number;
  offset?: number;
};

/**
 * list_turf_addresses — return the materialized ordered walk-list for a saved turf (risk: auto).
 */
export const listTurfAddressesTool: CampaignTool<Input> = {
  name: 'list_turf_addresses',
  description:
    'List addresses on a saved turf by label or id (ordered walk-list snapshot from build_turf).',
  inputSchema: {
    type: 'object',
    properties: {
      turf: { type: 'string', description: 'Saved turf label' },
      turfId: { type: 'number' },
      limit: { type: 'number' },
      offset: { type: 'number' },
    },
    additionalProperties: false,
  },
  risk: 'auto',
  async execute(input, ctx) {
    if (!ctx.organizationId) throw new Error('organizationId required in tool context');

    let turfId = input.turfId;
    if (!turfId && input.turf) {
      const t = await TurfRepo.getByLabel(String(input.turf).trim(), ctx.organizationId);
      if (!t) throw new Error(`No turf labeled "${input.turf}"`);
      turfId = t.id;
    }
    if (!turfId) throw new Error('turf label or turfId required');

    const { turf, addresses } = await TurfRepo.listAddresses(turfId, ctx.organizationId, {
      limit: input.limit || 500,
      offset: input.offset || 0,
    });

    const preview = addresses
      .slice(0, 30)
      .map((a, i) => `${i + 1}. ${a.label}${a.party ? ` · ${a.party}` : ''}`)
      .join('\n');

    return {
      summary: [
        `### Walk-list: “${turf.label}”`,
        '',
        `- Saved count: ${turf.address_count}`,
        `- Returned: ${addresses.length}`,
        '',
        preview || '_No addresses._',
      ].join('\n'),
      data: {
        turfId: turf.id,
        label: turf.label,
        addressCount: turf.address_count,
        returned: addresses.length,
        addresses: addresses.map((a) => ({
          voterGeoId: a.voterGeoId,
          sortOrder: a.sortOrder,
          label: a.label,
          party: a.party,
          street: a.street,
          city: a.city,
          state: a.state,
          zip: a.zip,
          lat: a.latitude,
          lng: a.longitude,
          canvassStatus: a.canvassStatus,
        })),
      },
    };
  },
};
