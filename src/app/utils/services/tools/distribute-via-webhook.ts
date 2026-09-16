import type { CampaignTool } from './types';

type Input = {
  webhookUrl?: string;
  payload?: Record<string, unknown>;
  channel?: string;
};

/** Stub — outbound webhook distribution hub is not built yet. */
export const distributeViaWebhookTool: CampaignTool<Input> = {
  name: 'distribute_via_webhook',
  description:
    'Distribute content via an outbound webhook (channels/partners). Not implemented — approval-gated stub; does not fire any webhook.',
  inputSchema: {
    type: 'object',
    properties: {
      webhookUrl: { type: 'string' },
      payload: { type: 'object' },
      channel: { type: 'string' },
    },
    additionalProperties: false,
  },
  risk: 'approval',
  async execute(input) {
    return {
      summary:
        'Not implemented: `distribute_via_webhook` cannot send outbound webhooks yet. Even after approval, nothing was distributed. Do not claim content was posted.',
      data: {
        implemented: false,
        reason: 'Spread/distribution webhook hub is a product stub; Telegram webhook is inbound-only.',
        requested: {
          webhookUrl: input.webhookUrl ?? null,
          channel: input.channel ?? null,
          payloadKeys: input.payload ? Object.keys(input.payload) : [],
        },
      },
    };
  },
};
