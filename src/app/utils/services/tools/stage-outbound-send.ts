/**
 * stage_outbound_send — approval-gated send of a tailored outbound draft.
 *
 * Drafting is private (draft_outbound, risk:auto). Public SMS/email stays here
 * behind the executor approval gate. Who/when = propensity ∩ segment; never a
 * one-shot blast of the raw segment list.
 */

import { sendSmsTool } from './send-sms';
import { sendEmailTool } from './send-email';
import { resolveGovernedRecipients } from '@/app/utils/services/outbound-send-governance';
import type { CampaignTool } from './types';

type Input = {
  segmentId: string;
  format: 'sms' | 'email';
  body: string;
  title?: string;
  subject?: string;
  /** Optional recipient override for smoke only — production uses propensity. */
  recipientOverride?: {
    emails?: string[];
    phones?: string[];
    personIds?: number[];
  };
};

function parseEmailSubjectBody(
  raw: string,
  subjectOverride?: string
): { subject: string; html: string } {
  const lines = raw.split(/\r?\n/);
  let subject = subjectOverride?.trim() || 'Campaign update';
  let start = 0;
  if (!subjectOverride && /^subject:\s*/i.test(lines[0] || '')) {
    subject = lines[0].replace(/^subject:\s*/i, '').trim() || subject;
    start = 1;
    if (lines[1]?.trim() === '') start = 2;
  }
  const text = lines.slice(start).join('\n').trim();
  const html = text
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, '<br/>')}</p>`)
    .join('\n');
  return { subject, html: html || `<p>${text}</p>` };
}

export const stageOutboundSendTool: CampaignTool<Input> = {
  name: 'stage_outbound_send',
  description:
    'Stage or send a tailored SMS/email draft for a live segment. Public outreach — requires human approval. Recipients come from propensity who-next ∩ segment (not a segment blast). Call after draft_outbound. Letter/ad copy: use /outbound review cards instead.',
  inputSchema: {
    type: 'object',
    properties: {
      segmentId: {
        type: 'string',
        description: 'Preset or saved segment id used for the tailored draft',
      },
      format: {
        type: 'string',
        enum: ['sms', 'email'],
        description: 'sms → send_sms; email → send_email',
      },
      body: {
        type: 'string',
        description: 'Full draft body (include Subject: line for email if known)',
      },
      title: { type: 'string', description: 'Optional campaign title' },
      subject: { type: 'string', description: 'Optional email subject override' },
      recipientOverride: {
        type: 'object',
        description: 'Smoke/test only — production ignores this path',
      },
    },
    required: ['segmentId', 'format', 'body'],
    additionalProperties: false,
  },
  risk: 'approval',
  async execute(input, ctx) {
    if (!ctx.organizationId) throw new Error('organizationId required');
    const format = String(input.format || '').toLowerCase();
    if (format !== 'sms' && format !== 'email') {
      throw new Error('format must be sms or email');
    }
    const body = String(input.body || '').trim();
    if (!body) throw new Error('body is required');
    const segmentId = String(input.segmentId || '').trim();
    if (!segmentId) throw new Error('segmentId is required');

    const recipients = await resolveGovernedRecipients({
      organizationId: ctx.organizationId,
      segmentId,
      override: input.recipientOverride,
    });

    if (format === 'sms') {
      if (!recipients.phones.length) {
        throw new Error(
          'No contactable phones from propensity ∩ segment. Who/when stays with the engagement loop — not a segment blast.'
        );
      }
      const result = await sendSmsTool.execute(
        { to: recipients.phones, body: body.slice(0, 1600) },
        ctx
      );
      return {
        summary: [
          result.summary,
          '',
          `- Segment: \`${segmentId}\``,
          `- ${recipients.note}`,
        ].join('\n'),
        data: {
          ...(result.data || {}),
          implemented: true,
          segmentId,
          format,
          recipients,
        },
      };
    }

    if (!recipients.emails.length) {
      throw new Error(
        'No contactable emails from propensity ∩ segment. Who/when stays with the engagement loop — not a segment blast.'
      );
    }
    const { subject, html } = parseEmailSubjectBody(body, input.subject);
    const result = await sendEmailTool.execute(
      {
        emails: recipients.emails,
        subject,
        html,
        campaignTitle: String(input.title || subject).slice(0, 120),
      },
      ctx
    );
    return {
      summary: [
        result.summary,
        '',
        `- Segment: \`${segmentId}\``,
        `- ${recipients.note}`,
      ].join('\n'),
      data: {
        ...(result.data || {}),
        implemented: true,
        segmentId,
        format,
        recipients,
      },
    };
  },
};
