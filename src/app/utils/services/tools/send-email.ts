import { openSql } from '@/app/utils/database/db';
import {
  isResendConfigured,
  sendCandidateEmail,
} from '@/app/utils/services/email';
import type { CampaignTool } from './types';
import type { RowDataPacket } from 'mysql2';

type Input = {
  emails: string[];
  subject: string;
  html: string;
  campaignTitle?: string;
  /** Optional from display name override */
  fromName?: string;
  /** Optional reply-to override (defaults to user email) */
  replyTo?: string;
};

async function loadCandidateIdentity(userId: number): Promise<{
  fromName: string;
  replyTo: string | null;
  localPart: string;
}> {
  const db = await openSql();
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT email, display_name FROM users WHERE id = ? LIMIT 1`,
    [userId]
  );
  const row = rows[0];
  const email = row?.email != null ? String(row.email).trim() : '';
  const display =
    row?.display_name != null ? String(row.display_name).trim() : '';
  const local =
    (email.split('@')[0] || display || 'campaign')
      .toLowerCase()
      .replace(/[^a-z0-9._+-]+/g, '-')
      .slice(0, 40) || 'campaign';
  return {
    fromName: display || email.split('@')[0] || 'Campaign',
    replyTo: email || null,
    localPart: local,
  };
}

/**
 * Send an email blast via Antelope's platform email (Resend).
 * Public outreach — requires human approval. Candidate never touches Resend.
 */
export const sendEmailTool: CampaignTool<Input> = {
  name: 'send_email',
  description:
    'Send an email campaign to recipients via Antelope platform email (Resend). Public outreach — requires human approval before send. Candidate never leaves Antelope or logs into Resend.',
  inputSchema: {
    type: 'object',
    properties: {
      emails: { type: 'array', items: { type: 'string' } },
      subject: { type: 'string' },
      html: { type: 'string', description: 'HTML body' },
      campaignTitle: { type: 'string' },
      fromName: { type: 'string' },
      replyTo: { type: 'string' },
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
    if (!emails.length) throw new Error('at least one recipient is required');
    if (!subject) throw new Error('subject is required');
    if (!html) throw new Error('html is required');

    if (!isResendConfigured()) {
      throw new Error(
        'Platform email is not configured (RESEND_API_KEY missing on server).'
      );
    }

    const identity = await loadCandidateIdentity(ctx.userId);
    const result = await sendCandidateEmail({
      fromName: String(input.fromName || identity.fromName).slice(0, 80),
      localPart: identity.localPart,
      replyTo: input.replyTo || identity.replyTo,
      to: emails,
      subject,
      html,
      headers: input.campaignTitle
        ? { 'X-Antelope-Campaign': String(input.campaignTitle).slice(0, 120) }
        : undefined,
    });

    return {
      summary: [
        '### Email campaign sent',
        `- Provider: ${result.provider}`,
        `- From: ${result.from}`,
        `- Total: ${result.total}`,
        `- Sent: ${result.sent}`,
        `- Failed: ${result.failed}`,
      ].join('\n'),
      data: {
        implemented: true,
        provider: result.provider,
        from: result.from,
        summary: {
          total: result.total,
          sent: result.sent,
          failed: result.failed,
        },
        results: result.results.slice(0, 50),
      },
    };
  },
};
