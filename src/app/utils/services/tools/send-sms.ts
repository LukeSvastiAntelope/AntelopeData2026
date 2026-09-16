import { sendMessages } from '@/app/utils/services/twilio';
import type { CampaignTool } from './types';

type Input = {
  to: string[];
  body: string;
  mediaUrl?: string[];
};

/**
 * Send SMS via Twilio — leaves the building. Approval required.
 */
export const sendSmsTool: CampaignTool<Input> = {
  name: 'send_sms',
  description:
    'Send SMS messages to a recipient list via Twilio. Public outreach — requires human approval before send.',
  inputSchema: {
    type: 'object',
    properties: {
      to: {
        type: 'array',
        items: { type: 'string' },
        description: 'E.164 or local phone numbers',
      },
      body: { type: 'string', description: 'SMS body' },
      mediaUrl: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional MMS media URLs',
      },
    },
    required: ['to', 'body'],
    additionalProperties: false,
  },
  risk: 'approval',
  async execute(input) {
    const to = Array.isArray(input.to) ? input.to.map(String).filter(Boolean) : [];
    const body = String(input.body || '').trim();
    if (!to.length) throw new Error('at least one recipient is required');
    if (!body) throw new Error('body is required');

    const { results, summary } = await sendMessages({
      channel: 'sms',
      to,
      body,
      mediaUrl: Array.isArray(input.mediaUrl) ? input.mediaUrl.map(String) : undefined,
    });

    return {
      summary: [
        '### SMS send complete',
        `- Total: ${summary.total}`,
        `- Sent: ${summary.sent}`,
        `- Failed: ${summary.failed}`,
      ].join('\n'),
      data: { summary, results },
    };
  },
};
