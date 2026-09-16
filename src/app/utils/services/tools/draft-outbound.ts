import type { CampaignTool } from './types';

type Input = {
  channel?: string;
  audience?: string;
  goal?: string;
};

/** Stub — outbound sequence drafting is not wired yet. */
export const draftOutboundTool: CampaignTool<Input> = {
  name: 'draft_outbound',
  description:
    'Draft outbound outreach sequences (SMS/email/phone scripts). Not implemented yet — returns not-implemented so the consultant stays honest.',
  inputSchema: {
    type: 'object',
    properties: {
      channel: { type: 'string', description: 'sms | email | phone | mixed' },
      audience: { type: 'string' },
      goal: { type: 'string' },
    },
    additionalProperties: false,
  },
  risk: 'auto',
  async execute(input) {
    return {
      summary:
        'Not implemented: `draft_outbound` is not available yet. Do not invent outreach scripts as if this tool produced them. Outbound tooling is still a stub surface in the product.',
      data: {
        implemented: false,
        reason: 'Outbound sequence drafting service does not exist yet.',
        requested: {
          channel: input.channel ?? null,
          audience: input.audience ?? null,
          goal: input.goal ?? null,
        },
      },
    };
  },
};
