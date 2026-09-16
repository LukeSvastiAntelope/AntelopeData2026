import type { CampaignTool } from './types';

type Input = {
  amountCents?: number;
  currency?: string;
  purpose?: string;
  donorEmail?: string;
};

/**
 * Stub — Stripe in this product is platform credits, not donor fundraising charges.
 */
export const chargeOrFundraiseTool: CampaignTool<Input> = {
  name: 'charge_or_fundraise',
  description:
    'Charge a donor or launch a fundraising payment. Not implemented for donor charges — approval-gated stub. Do not invent payment results.',
  inputSchema: {
    type: 'object',
    properties: {
      amountCents: { type: 'number' },
      currency: { type: 'string' },
      purpose: { type: 'string' },
      donorEmail: { type: 'string' },
    },
    additionalProperties: false,
  },
  risk: 'approval',
  async execute(input) {
    return {
      summary:
        'Not implemented: `charge_or_fundraise` cannot charge donors. Existing Stripe flows are for platform credits, not fundraising. Even after approval, no charge was made.',
      data: {
        implemented: false,
        reason: 'No donor fundraising charge API; Stripe checkout is virtual credits only.',
        requested: {
          amountCents: input.amountCents ?? null,
          currency: input.currency ?? null,
          purpose: input.purpose ?? null,
          donorEmail: input.donorEmail ?? null,
        },
      },
    };
  },
};
