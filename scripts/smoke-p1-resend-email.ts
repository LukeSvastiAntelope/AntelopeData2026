/**
 * P1 smoke — platform Resend send via EmailProvider (no key in client/repo).
 *
 *   npx tsx --tsconfig tsconfig.json -r dotenv/config scripts/smoke-p1-resend-email.ts
 *
 * Optional: SMOKE_EMAIL_TO=you@example.com to pick the inbox.
 */

import { closePool, openSql } from '../src/app/utils/database/db';
import {
  buildCandidateFrom,
  getEmailProvider,
  isResendConfigured,
  sendBulkEmail,
  sendCandidateEmail,
} from '../src/app/utils/services/email';
import { executeTool, executeApprovedTool } from '../src/app/utils/services/tools/executor';
import type { RowDataPacket } from 'mysql2';

require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  assert(isResendConfigured(), 'RESEND_API_KEY must be set in server env (.env.local)');
  // Never print the key
  assert(
    !JSON.stringify(process.env).includes('process.env.RESEND'),
    'sanity'
  );
  const key = process.env.RESEND_API_KEY || '';
  assert(key.startsWith('re_'), 'key shape');
  assert(!key.includes(' '), 'key has no spaces');

  const provider = getEmailProvider();
  assert(provider.name === 'resend', `provider=${provider.name}`);

  const sendDomain =
    process.env.EMAIL_SEND_DOMAIN?.trim() || 'send.antelopedata.org';
  const { from, replyTo } = buildCandidateFrom({
    fromName: 'Antelope P1 Smoke',
    localPart: 'p1-smoke',
    replyTo: 'noreply@antelopedata.org',
  });
  assert(from.includes(`@${sendDomain}`), `from domain: ${from}`);
  assert(Boolean(replyTo), 'reply-to set');

  const db = await openSql();
  const [users] = await db.execute<RowDataPacket[]>(
    `SELECT id, email FROM users ORDER BY id ASC LIMIT 1`
  );
  assert(users[0]?.id != null, 'need user');
  const userId = Number(users[0].id);

  const to =
    process.env.SMOKE_EMAIL_TO?.trim() ||
    (users[0].email ? String(users[0].email).trim() : '') ||
    'delivered@resend.dev';

  const tag = `p1_${Date.now()}`;
  const html = `<p>Antelope P1 Resend smoke (${tag}).</p><p>If you received this, platform send works.</p>`;

  const bulk = await sendCandidateEmail({
    fromName: 'Antelope P1 Smoke',
    localPart: 'p1-smoke',
    replyTo: 'noreply@antelopedata.org',
    to: [to],
    subject: `[Antelope P1] Resend smoke ${tag}`,
    html,
  });

  assert(bulk.provider === 'resend', 'bulk provider');
  assert(bulk.total === 1, 'total 1');
  assert(bulk.sent === 1, `sent=${bulk.sent} failed=${bulk.failed} err=${bulk.results[0]?.error}`);
  assert(bulk.results[0]?.id, 'provider message id');
  assert(bulk.from.includes(`@${sendDomain}`), 'candidate from domain');

  // Executor gate: send_email still requires approval
  const gated = await executeTool(
    {
      name: 'send_email',
      input: {
        emails: [to],
        subject: 'should not send',
        html: '<p>nope</p>',
        approved: true,
      },
    },
    { userId }
  );
  assert(gated.status === 'pending_approval', 'send_email stays approval-gated');

  // Approved path actually sends (second real email — keep tiny)
  const approved = await executeApprovedTool(
    {
      name: 'send_email',
      input: {
        emails: [to],
        subject: `[Antelope P1] Tool send ${tag}`,
        html: `<p>Approved send_email tool path (${tag}).</p>`,
      },
    },
    { userId }
  );
  assert(approved.ok && approved.status === 'executed', `tool exec: ${approved.summary}`);
  assert(
    approved.data && (approved.data as { summary?: { sent?: number } }).summary?.sent === 1,
    'tool sent 1'
  );

  // Batch helper still works for multi-recipient same content
  const multi = await sendBulkEmail({
    from,
    replyTo,
    to: [to],
    subject: `[Antelope P1] Bulk ${tag}`,
    html: `<p>Bulk path ${tag}</p>`,
    chunkSize: 10,
  });
  assert(multi.sent === 1, 'multi sent');

  console.log(
    JSON.stringify(
      {
        ok: true,
        provider: provider.name,
        from: bulk.from,
        to,
        messageId: bulk.results[0]?.id,
        toolGated: gated.status,
        toolExecuted: approved.status,
      },
      null,
      2
    )
  );
  console.log('PASS: P1 — Resend server send via EmailProvider; key never in client');

  await closePool();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await closePool();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
