import { TurfRepo } from '@/app/utils/database/turf-repo';
import type { CampaignTool } from './types';

type Input = {
  turf?: string;
  turfId?: number;
  assignedTo?: number | null;
  unassign?: boolean;
};

/** assign_turf — set canvasser on a saved turf (risk: auto). */
export const assignTurfTool: CampaignTool<Input> = {
  name: 'assign_turf',
  description:
    'Assign a saved turf walk-list to a canvasser user id (or unassign). Uses turfs.assigned_to.',
  inputSchema: {
    type: 'object',
    properties: {
      turf: { type: 'string', description: 'Turf label' },
      turfId: { type: 'number' },
      assignedTo: { type: 'number', description: 'User id to assign' },
      unassign: { type: 'boolean', description: 'Clear assignment' },
    },
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

    const assignedTo = input.unassign ? null : input.assignedTo ?? ctx.userId;
    const turf = await TurfRepo.assign(turfId, ctx.organizationId, assignedTo ?? null);
    if (!turf) throw new Error('Turf not found');

    return {
      summary: turf.assigned_to
        ? `Assigned “${turf.label}” to user ${turf.assigned_to} (${turf.address_count} stops).`
        : `Unassigned “${turf.label}”.`,
      data: {
        turfId: turf.id,
        label: turf.label,
        assignedTo: turf.assigned_to,
        addressCount: turf.address_count,
      },
    };
  },
};
