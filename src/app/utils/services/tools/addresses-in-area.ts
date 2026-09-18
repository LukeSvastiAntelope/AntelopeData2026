import { GeofenceRepo, addressesInFence } from '@/app/utils/database/geo-repo';
import type { CampaignTool } from './types';

type Input = {
  area: string;
  limit?: number;
};

/**
 * addresses_in_area — private reversible read (risk: auto).
 * Resolves a saved fence by label (e.g. "Area A") and returns contained
 * voter_geo addresses via MySQL ST_Contains / spatial index.
 */
export const addressesInAreaTool: CampaignTool<Input> = {
  name: 'addresses_in_area',
  description:
    'List geocoded voter-file addresses inside a saved campaign geofence by label (e.g. "Area A"). Uses the MySQL spatial index (ST_Contains). Private to the campaign; reversible read.',
  inputSchema: {
    type: 'object',
    properties: {
      area: {
        type: 'string',
        description: 'Saved fence label, e.g. "Area A"',
      },
      limit: {
        type: 'number',
        description: 'Max addresses to return (default 500)',
      },
    },
    required: ['area'],
    additionalProperties: false,
  },
  risk: 'auto',
  async execute(input, ctx) {
    const label = String(input.area || '').trim();
    if (!label) throw new Error('area (fence label) is required');
    if (!ctx.organizationId) {
      throw new Error('organizationId required in tool context');
    }

    const fence = await GeofenceRepo.getByLabel(label, ctx.organizationId);
    if (!fence) {
      throw new Error(`No saved fence labeled "${label}" for this campaign`);
    }

    const { addresses } = await addressesInFence(fence.id, ctx.organizationId, {
      limit: input.limit || 500,
    });

    const preview = addresses
      .slice(0, 25)
      .map((a) => `- ${a.label} (${a.latitude.toFixed(5)}, ${a.longitude.toFixed(5)})`)
      .join('\n');

    return {
      summary: [
        `### Addresses in “${fence.label}”`,
        '',
        `- Fence type: ${fence.fence_type}`,
        `- Purpose: ${fence.purpose}`,
        `- Count: ${addresses.length}`,
        '',
        preview || '_No geocoded addresses inside this fence yet._',
        addresses.length > 25 ? `\n_…and ${addresses.length - 25} more_` : '',
      ]
        .filter(Boolean)
        .join('\n'),
      data: {
        fenceId: fence.id,
        label: fence.label,
        fenceType: fence.fence_type,
        purpose: fence.purpose,
        count: addresses.length,
        addresses: addresses.map((a) => ({
          id: a.id,
          voterFileId: a.voterFileId,
          label: a.label,
          lat: a.latitude,
          lng: a.longitude,
          zip: a.zip,
        })),
      },
    };
  },
};
