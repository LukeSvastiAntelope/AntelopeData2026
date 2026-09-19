import { TurfRepo, type TurfStopStatus } from '@/app/utils/database/turf-repo';
import type { CampaignTool } from './types';

type Input = {
  turf?: string;
  turfId?: number;
  voterGeoId: number;
  status: string;
  party?: string;
  notes?: string;
};

/** record_turf_stop — door outcome on a walk-list stop (risk: auto). */
export const recordTurfStopTool: CampaignTool<Input> = {
  name: 'record_turf_stop',
  description:
    'Record a field outcome on a turf walk-list stop (confirmed / not_home / refused / …). Mirrors to person_records when linked; refused also adds contact_suppression.',
  inputSchema: {
    type: 'object',
    properties: {
      turf: { type: 'string' },
      turfId: { type: 'number' },
      voterGeoId: { type: 'number', description: 'Stop voter_geo id from the walk-list' },
      status: {
        type: 'string',
        description: 'confirmed | contacted | not_home | refused | moved | wrong_address',
      },
      party: { type: 'string' },
      notes: { type: 'string' },
    },
    required: ['voterGeoId', 'status'],
    additionalProperties: false,
  },
  risk: 'auto',
  async execute(input, ctx) {
    if (!ctx.organizationId) throw new Error('organizationId required');
    let turfId = input.turfId;
    if (!turfId && input.turf) {
      const t = await TurfRepo.getByLabel(String(input.turf).trim(), ctx.organizationId);
      if (!t) throw new Error(`No turf labeled "${input.turf}"`);
      turfId = t.id;
    }
    if (!turfId) throw new Error('turf or turfId required');

    const { outcome, address } = await TurfRepo.recordStop({
      organizationId: ctx.organizationId,
      turfId,
      voterGeoId: Number(input.voterGeoId),
      recordedBy: ctx.userId,
      status: String(input.status) as TurfStopStatus,
      party: input.party ?? null,
      notes: input.notes ?? null,
    });

    return {
      summary: `Stop #${address?.sortOrder ?? '?'} ${address?.label || outcome.voter_geo_id}: ${outcome.status}${
        outcome.party ? ` · ${outcome.party}` : ''
      }`,
      data: {
        outcome,
        address: address
          ? {
              voterGeoId: address.voterGeoId,
              sortOrder: address.sortOrder,
              label: address.label,
              canvassStatus: address.canvassStatus,
              party: address.party,
            }
          : null,
      },
    };
  },
};
