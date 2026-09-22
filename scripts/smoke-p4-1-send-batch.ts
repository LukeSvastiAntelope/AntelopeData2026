/**
 * P4-1 smoke — EmailProvider.sendBatch via Resend POST /emails/batch.
 *
 *   npx tsx --tsconfig tsconfig.json -r dotenv/config scripts/smoke-p4-1-send-batch.ts
 */

import {
  getEmailProvider,
  isResendConfigured,
  buildCandidateFrom,
} from '../src/app/utils/services/email';
import { RESEND_MAX_BATCH } from '../src/app/utils/services/email/resend-provider';

require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  assert(isResendConfigured(), 'RESEND_API_KEY required');
  assert(RESEND_MAX_BATCH === 100, 'batch cap 100');

  const provider = getEmailProvider();
  assert(typeof provider.sendBatch === 'function', 'sendBatch on provider');

  const empty = await provider.sendBatch([]);
  assert(empty.length === 0, 'empty batch');

  const { from, replyTo } = buildCandidateFrom({
    fromName: 'Antelope P4-1 Smoke',
    localPart: 'p4-1-smoke',
    replyTo: 'noreply@antelopedata.org',
  });

  const to =
    process.env.SMOKE_EMAIL_TO?.trim() || 'delivered@resend.dev';
  const tag = `p4_1_${Date.now()}`;

  const messages = [
    {
      from,
      to: [to],
      subject: `[Antelope P4-1] batch A ${tag}`,
      html: `<p>Batch message A (${tag})</p>`,
      replyTo,
      headers: { 'X-Antelope-Smoke': 'p4-1-a' },
    },
    {
      from,
      to: [to],
      subject: `[Antelope P4-1] batch B ${tag}`,
      html: `<p>Batch message B (${tag})</p>`,
      replyTo,
      headers: { 'X-Antelope-Smoke': 'p4-1-b' },
    },
  ];

  const results = await provider.sendBatch(messages);
  assert(results.length === 2, `results length=${results.length}`);
  assert(results[0].status === 'sent', `A status=${results[0].status} err=${results[0].error}`);
  assert(results[1].status === 'sent', `B status=${results[1].status} err=${results[1].error}`);
  assert(Boolean(results[0].id), 'A has provider id');
  assert(Boolean(results[1].id), 'B has provider id');
  assert(results[0].id !== results[1].id, 'distinct message ids');

  // send() still works
  const single = await provider.send({
    from,
    to: [to],
    subject: `[Antelope P4-1] single ${tag}`,
    html: `<p>Single still works (${tag})</p>`,
    replyTo,
  });
  assert(single.status === 'sent', `single=${single.status}`);

  console.log(
    JSON.stringify(
      {
        ok: true,
        batchIds: results.map((r) => r.id),
        singleId: single.id,
        from,
      },
      null,
      2
    )
  );
  console.log('PASS: P4-1 — sendBatch (/emails/batch) + send() intact');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
