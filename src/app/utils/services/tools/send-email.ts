import { getMailchimpCreds, sendSurveyEmailCampaign } from '@/app/utils/services/mailchimp';
import type { CampaignTool } from './types';

type Input = {
  emails: string[];
  subject: string;
  html: string;
  campaignTitle?: string;
};

/**
 * Send an email blast via Mailchimp — leaves the building. Approval required.
 */
export const sendEmailTool: CampaignTool<Input> = {
  name: 'send_email',
  description:
    'Send an email campaign to recipients via connected Mailchimp. Public outreach — requires human approval before send.',
  inputSchema: {
    type: 'object',
    properties: {
      emails: { type: 'array', items: { type: 'string' } },
      subject: { type: 'string' },
      html: { type: 'string', description: 'HTML body' },
      campaignTitle: { type: 'string' },
    },
    required: ['emails', 'subject', 'html'],
    additionalProperties: false,
  },
  risk: 'approval',
  async execute(input, ctx) {
    const emails = Array.isArray(input.emails)
      ? input.emails.map((e) => String(e).trim()).filter(Boolean)
      : [];
    const subject = String(input.subject || '').trim();
    const html = String(input.html || '').trim();
    if (!emails.length) throw new Error('at least one email is required');
    if (!subject) throw new Error('subject is required');
    if (!html) throw new Error('html is required');

    const creds = await getMailchimpCreds(ctx.userId);
    if (!creds) {
      throw new Error('Mailchimp is not connected for this account.');
    }

    const result = await sendSurveyEmailCampaign({
      creds,
      emails,
      subject,
      html,
      campaignTitle: String(input.campaignTitle || subject).slice(0, 120),
    });

    return {
      summary: [
        '### Email campaign sent',
        `- Campaign id: ${result.campaignId}`,
        `- Total: ${result.summary.total}`,
        `- Added: ${result.summary.added}`,
        `- Failed: ${result.summary.failed}`,
      ].join('\n'),
      data: {
        campaignId: result.campaignId,
        summary: result.summary,
      },
    };
  },
};
