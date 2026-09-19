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
    'Append a canvass contact on a turf stop (full trail) and update the current-status rollup. Statuses: not_home, moved, wrong_address, supporter, lean_support, undecided, lean_against, refused, dnc_request (+ legacy confirmed/contacted). dnc_request and refused write contact_suppression; outcomes feed the consultant situation snapshot.',
  inputSchema: {
    type: 'object',
    properties: {
      turf: { type: 'string' },
      turfId: { type: 'number' },
      voterGeoId: { type: 'number', description: 'Stop voter_geo id from the walk-list' },
      status: {
        type: 'string',
        description:
          'not_home | moved | wrong_address | supporter | lean_support | undecided | lean_against | refused | dnc_request | confirmed | contacted',
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

    const { outcome, address, contactId } = await TurfRepo.recordStop({
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
      } (contact #${contactId})`,
      data: {
        contactId,
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
