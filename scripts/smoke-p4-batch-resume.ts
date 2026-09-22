/**
 * P4 smoke — batch chunking (>100), idempotent resume, 429 retry.
 *
 *   npx tsx --tsconfig tsconfig.json -r dotenv/config scripts/smoke-p4-batch-resume.ts
 */

import { closePool, openSql } from '../src/app/utils/database/db';
import {
  EmailSendRepo,
  ensureEmailTables,
} from '../src/app/utils/database/email-send-repo';
import type {
  EmailProvider,
  EmailSendRequest,
  EmailSendResult,
} from '../src/app/utils/services/email/EmailProvider';
import { sendCompliantBulk } from '../src/app/utils/services/email/bulk-send';
import { ResendEmailProvider } from '../src/app/utils/services/email/resend-provider';
import type { RowDataPacket } from 'mysql2';

require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

/** Mock provider that records sendBatch call sizes — no network. */
function mockBatchProvider(): EmailProvider & {
  batchCalls: number[][];
  sendCalls: number;
} {
  const batchCalls: number[][] = [];
  let sendCalls = 0;
  let seq = 0;
  return {
    name: 'mock-batch',
    batchCalls,
    get sendCalls() {
      return sendCalls;
    },
    async send(req: EmailSendRequest): Promise<EmailSendResult> {
      sendCalls += 1;
      seq += 1;
      return { id: `mock_single_${seq}`, status: 'sent', to: req.to };
    },
    async sendBatch(messages: EmailSendRequest[]): Promise<EmailSendResult[]> {
      batchCalls.push(messages.map((m) => m.to.length));
      return messages.map((m) => {
        seq += 1;
        return { id: `mock_batch_${seq}`, status: 'sent' as const, to: m.to };
      });
    },
  };
}

async function main() {
  await ensureEmailTables();
  const db = await openSql();
  const tag = `p4_${Date.now()}`;

  const [users] = await db.execute<RowDataPacket[]>(
    `SELECT id FROM users ORDER BY id ASC LIMIT 1`
  );
  assert(users[0]?.id != null, 'need user');
  const userId = Number(users[0].id);
  const [orgs] = await db.execute<RowDataPacket[]>(
    `SELECT id FROM organizations ORDER BY id ASC LIMIT 1`
  );
  assert(orgs[0]?.id != null, 'need org');
  const orgId = Number(orgs[0].id);

  // ── (a) >100 recipients → multiple batches ─────────────────────────
  const mock = mockBatchProvider();
  const emails101 = Array.from(
    { length: 101 },
    (_, i) => `voter${i}.${tag}@example.com`
  );
  const sendId = await EmailSendRepo.createSend({
    userId,
    organizationId: orgId,
    subject: `[P4] batch ${tag}`,
    fromAddress: `P4 Smoke <p4@antelopedata.org>`,
    provider: 'mock-batch',
    receiptId: `rcpt_p4_${tag}`,
    summary: { total: 101 },
  });

  const first = await sendCompliantBulk({
    userId,
    organizationId: orgId,
    sendId,
    from: `P4 Smoke <p4@antelopedata.org>`,
    replyTo: 'noreply@antelopedata.org',
    subject: `[P4] batch ${tag}`,
    htmlBase: `<p>P4 bulk ${tag}</p>`,
    fromName: 'P4 Smoke',
    emails: emails101,
    provider: mock,
  });

  assert(first.summary.total === 101, `total=${first.summary.total}`);
  assert(first.summary.sent === 101, `sent=${first.summary.sent}`);
  assert(first.summary.failed === 0, `failed=${first.summary.failed}`);
  assert(first.summary.skipped === 0, `skipped=${first.summary.skipped}`);
  assert(
    first.summary.batchRequests === 2,
    `batchRequests=${first.summary.batchRequests} (expect 2 for 101)`
  );
  assert(mock.batchCalls.length === 2, `mock batchCalls=${mock.batchCalls.length}`);
  assert(mock.batchCalls[0].length === 100, 'first chunk 100');
  assert(mock.batchCalls[1].length === 1, 'second chunk 1');
  // Every message has unique unsub (CAN-SPAM header present via buildCompliantMessage)
  assert(first.canSpam === true, 'canSpam');

  // ── (b) resume same sendId → 0 new provider sends ──────────────────
  const mock2 = mockBatchProvider();
  const second = await sendCompliantBulk({
    userId,
    organizationId: orgId,
    sendId,
    from: `P4 Smoke <p4@antelopedata.org>`,
    subject: `[P4] batch ${tag}`,
    htmlBase: `<p>P4 bulk ${tag}</p>`,
    fromName: 'P4 Smoke',
    emails: emails101,
    provider: mock2,
  });
  assert(second.summary.sent === 0, `resume sent=${second.summary.sent}`);
  assert(second.summary.skipped === 101, `resume skipped=${second.summary.skipped}`);
  assert(second.summary.batchRequests === 0, 'no batch on full resume');
  assert(mock2.batchCalls.length === 0, 'mock got zero batch calls on resume');

  // Partial resume: add 5 new emails to same send
  const extra = Array.from({ length: 5 }, (_, i) => `extra${i}.${tag}@example.com`);
  const mock3 = mockBatchProvider();
  const third = await sendCompliantBulk({
    userId,
    organizationId: orgId,
    sendId,
    from: `P4 Smoke <p4@antelopedata.org>`,
    subject: `[P4] batch ${tag}`,
    htmlBase: `<p>P4 bulk ${tag}</p>`,
    fromName: 'P4 Smoke',
    emails: [...emails101, ...extra],
    provider: mock3,
  });
  assert(third.summary.sent === 5, `partial resume sent=${third.summary.sent}`);
  assert(third.summary.skipped === 101, `partial skipped=${third.summary.skipped}`);
  assert(third.summary.batchRequests === 1, 'one batch for 5 new');

  // Tenant guard
  const stolen = await EmailSendRepo.getOwnedSend(sendId, userId + 999999, orgId);
  assert(stolen === null, 'cross-tenant getOwnedSend null');

  // ── (c) simulated 429 is retried, not dropped ──────────────────────
  const realProvider = new ResendEmailProvider();
  let fetchCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/emails/batch')) {
      fetchCalls += 1;
      if (fetchCalls === 1) {
        return new Response(JSON.stringify({ message: 'rate_limit_exceeded', name: 'rate_limit_exceeded' }), {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': '0',
            'ratelimit-remaining': '0',
          },
        });
      }
      // Second try: success with 2 ids
      return new Response(
        JSON.stringify({
          data: [{ id: `retry_ok_a_${tag}` }, { id: `retry_ok_b_${tag}` }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return originalFetch(input, init);
  }) as typeof fetch;

  try {
    const results = await realProvider.sendBatch([
      {
        from: 'P4 <p4@antelopedata.org>',
        to: [`r429a.${tag}@example.com`],
        subject: '429 a',
        html: '<p>a</p>',
      },
      {
        from: 'P4 <p4@antelopedata.org>',
        to: [`r429b.${tag}@example.com`],
        subject: '429 b',
        html: '<p>b</p>',
      },
    ]);
    assert(fetchCalls >= 2, `fetchCalls=${fetchCalls} (expect retry after 429)`);
    assert(results.length === 2, 'two results');
    assert(results[0].status === 'sent', `r0=${results[0].status} ${results[0].error}`);
    assert(results[1].status === 'sent', `r1=${results[1].status}`);
    assert(results[0].id.startsWith('retry_ok_'), 'got success ids after retry');
  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        sendId,
        batchRequests: first.summary.batchRequests,
        resumeSkipped: second.summary.skipped,
        partialNew: third.summary.sent,
        fetchCallsAfter429: fetchCalls,
      },
      null,
      2
    )
  );
  console.log('PASS: P4 — batch (>100) + idempotent resume + 429 retry');

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
