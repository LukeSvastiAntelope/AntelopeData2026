/**
 * P3 smoke — CAN-SPAM injection, candidate suppression, webhook → status,
 * unsubscribe removes address from future sends for that candidate only.
 *
 *   npx tsx --tsconfig tsconfig.json -r dotenv/config scripts/smoke-p3-email-compliance.ts
 */

import { closePool, openSql } from '../src/app/utils/database/db';
import {
  EmailEventRepo,
  EmailSendRepo,
  EmailSuppressionRepo,
  mintUnsubscribeToken,
  verifyUnsubscribeToken,
  ensureEmailTables,
} from '../src/app/utils/database/email-send-repo';
import {
  buildCanSpamHeaders,
  buildCompliantMessage,
  getPhysicalAddress,
  injectCanSpamFooter,
  isResendConfigured,
  prepareRecipientList,
  buildCandidateFrom,
  getEmailProvider,
  sendCompliantBulk,
} from '../src/app/utils/services/email';
import type { RowDataPacket } from 'mysql2';

require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  assert(isResendConfigured(), 'RESEND_API_KEY required in .env.local');
  // Never print or assert on the raw key value in logs
  assert(Boolean(process.env.RESEND_API_KEY?.startsWith('re_')), 'key shape');

  await ensureEmailTables();

  const db = await openSql();
  const tag = `p3_${Date.now()}`;
  const [orgs] = await db.execute<RowDataPacket[]>(
    `SELECT id FROM organizations ORDER BY id ASC LIMIT 1`
  );
  assert(orgs[0]?.id != null, 'need org');
  const orgId = Number(orgs[0].id);

  const [users] = await db.execute<RowDataPacket[]>(
    `SELECT id, email FROM users ORDER BY id ASC LIMIT 2`
  );
  assert(users[0]?.id != null, 'need user');
  const userA = Number(users[0].id);
  const userB = users[1]?.id != null ? Number(users[1].id) : userA + 999999;

  const to =
    process.env.SMOKE_EMAIL_TO?.trim() ||
    (users[0].email ? String(users[0].email).trim() : 'delivered@resend.dev');

  // ── CAN-SPAM helpers ──────────────────────────────────────────────
  const addr = getPhysicalAddress();
  assert(addr.length > 10, 'physical address present');
  const token = mintUnsubscribeToken({ userId: userA, email: to, sendId: 1 });
  const verified = verifyUnsubscribeToken(token);
  assert(verified?.userId === userA, 'token user');
  assert(verified?.email === to.toLowerCase(), 'token email');

  const headers = buildCanSpamHeaders('https://example.com/unsub');
  assert(headers['List-Unsubscribe']?.includes('<https://'), 'List-Unsubscribe');
  assert(headers['List-Unsubscribe-Post'] === 'List-Unsubscribe=One-Click', 'one-click');

  const footered = injectCanSpamFooter('<p>Hello</p>', {
    unsubscribeUrl: 'https://example.com/unsub',
    physicalAddress: addr,
    fromName: 'Smoke Campaign',
  });
  assert(footered.includes(addr), 'footer has address');
  assert(footered.includes('Unsubscribe'), 'footer has unsub');
  assert(footered.includes('data-antelope-canspam'), 'footer marker');

  const compliant = buildCompliantMessage({
    html: '<p>P3 body</p>',
    userId: userA,
    email: to,
    sendId: 42,
    fromName: 'Smoke',
  });
  assert(compliant.html.includes('Unsubscribe'), 'compliant html');
  assert(compliant.headers['List-Unsubscribe'], 'compliant headers');
  assert(compliant.unsubscribeTokenHash.length === 64, 'token hash');

  // ── Candidate-scoped suppression isolation ────────────────────────
  const suppressedEmail = `unsub.${tag}@example.com`;
  await EmailSuppressionRepo.add({
    userId: userA,
    organizationId: orgId,
    email: suppressedEmail,
    reason: 'unsubscribe',
    source: 'smoke',
  });

  const prepA = await prepareRecipientList({
    organizationId: orgId,
    userId: userA,
    raw: [to, suppressedEmail, 'bad'],
  });
  assert(!prepA.emails.includes(suppressedEmail), 'userA drops own suppression');
  assert(prepA.suppressedCount >= 1, 'suppressed counted');

  if (userB !== userA && users[1]) {
    const prepB = await prepareRecipientList({
      organizationId: orgId,
      userId: userB,
      raw: [suppressedEmail],
    });
    // userB must NOT inherit userA's suppression
    assert(
      prepB.emails.includes(suppressedEmail),
      'userB still allowed (candidate isolation)'
    );
  }

  // ── Persist send + recipient, simulate webhook bounce → suppress ──
  const { from } = buildCandidateFrom({
    fromName: 'Antelope P3 Smoke',
    localPart: 'p3-smoke',
    replyTo: 'noreply@antelopedata.org',
  });

  const bounceTarget = `bounce.${tag}@example.com`;
  const sendId = await EmailSendRepo.createSend({
    userId: userA,
    organizationId: orgId,
    subject: `[Antelope P3] ${tag}`,
    fromAddress: from,
    provider: 'resend',
    receiptId: `rcpt_smoke_${tag}`,
    summary: { total: 1, sent: 1, failed: 0 },
  });

  const fakeMsgId = `msg_smoke_${tag}`;
  const recipientId = await EmailSendRepo.addRecipient({
    sendId,
    userId: userA,
    organizationId: orgId,
    email: bounceTarget,
    providerMessageId: fakeMsgId,
    status: 'sent',
    unsubTokenHash: compliant.unsubscribeTokenHash,
  });

  await EmailEventRepo.record({
    userId: userA,
    organizationId: orgId,
    sendId,
    recipientId,
    email: bounceTarget,
    eventType: 'email.sent',
    providerMessageId: fakeMsgId,
  });

  // Simulate webhook: delivered
  const delivered = await EmailSendRepo.updateRecipientByProviderId({
    providerMessageId: fakeMsgId,
    status: 'delivered',
  });
  assert(delivered?.recipientId === recipientId, 'delivered matched');

  await EmailEventRepo.record({
    userId: userA,
    organizationId: orgId,
    sendId,
    recipientId,
    email: bounceTarget,
    eventType: 'email.delivered',
    providerMessageId: fakeMsgId,
  });

  // Simulate hard bounce → suppress
  await EmailSendRepo.updateRecipientByProviderId({
    providerMessageId: fakeMsgId,
    status: 'bounced',
  });
  await EmailSuppressionRepo.add({
    userId: userA,
    organizationId: orgId,
    email: bounceTarget,
    reason: 'bounce',
    source: 'resend_webhook',
  });
  await EmailEventRepo.record({
    userId: userA,
    organizationId: orgId,
    sendId,
    recipientId,
    email: bounceTarget,
    eventType: 'email.bounced',
    providerMessageId: fakeMsgId,
  });

  const prepAfterBounce = await prepareRecipientList({
    organizationId: orgId,
    userId: userA,
    raw: [bounceTarget, to],
  });
  assert(!prepAfterBounce.emails.includes(bounceTarget), 'bounce auto-suppresses future sends');
  assert(prepAfterBounce.emails.includes(to.toLowerCase()), 'other addresses still ok');

  // Unsubscribe path
  const unsubEmail = `clickunsub.${tag}@example.com`;
  const unsubTok = mintUnsubscribeToken({
    userId: userA,
    email: unsubEmail,
    sendId,
  });
  const parsed = verifyUnsubscribeToken(unsubTok);
  assert(parsed?.email === unsubEmail, 'unsub token');
  await EmailSuppressionRepo.add({
    userId: userA,
    organizationId: orgId,
    email: unsubEmail,
    reason: 'unsubscribe',
    source: 'one_click',
  });
  const prepUnsub = await prepareRecipientList({
    organizationId: orgId,
    userId: userA,
    raw: [unsubEmail],
  });
  assert(prepUnsub.emails.length === 0, 'unsub removes from future sends');

  // Real compliant send via shared helper
  const liveSendId = await EmailSendRepo.createSend({
    userId: userA,
    organizationId: orgId,
    subject: `[Antelope P3] Compliance smoke ${tag}`,
    fromAddress: from,
    provider: getEmailProvider().name,
    receiptId: `rcpt_live_${tag}`,
    summary: { total: 1, sent: 0, failed: 0 },
  });
  const live = await sendCompliantBulk({
    userId: userA,
    organizationId: orgId,
    sendId: liveSendId,
    from,
    replyTo: 'noreply@antelopedata.org',
    subject: `[Antelope P3] Compliance smoke ${tag}`,
    htmlBase: `<p>P3 compliance smoke (${tag}).</p>`,
    fromName: 'Antelope P3 Smoke',
    emails: [to],
  });
  assert(live.summary.sent === 1, `live sent=${live.summary.sent}`);
  assert(live.canSpam === true, 'canSpam');

  const recent = await EmailSendRepo.listRecentSends(userA, 5);
  assert(recent.some((s) => s.id === liveSendId || s.id === sendId), 'results list has sends');

  const events = await EmailEventRepo.listForUser(userA, 20);
  assert(events.some((e) => e.eventType.startsWith('email.')), 'event stream has email events');

  console.log(
    JSON.stringify(
      {
        ok: true,
        to,
        liveSendId,
        liveSent: live.summary.sent,
        canSpam: true,
        physicalAddressSet: Boolean(addr),
        suppressionsForUserA: (await EmailSuppressionRepo.listForUser(userA, 10)).length,
      },
      null,
      2
    )
  );
  console.log(
    'PASS: P3 — CAN-SPAM + candidate suppression + webhook status + event stream'
  );

  // Cleanup smoke suppressions / sends (best effort)
  try {
    await db.execute(
      `DELETE FROM email_suppressions WHERE user_id = ? AND email LIKE ?`,
      [userA, `%.${tag}@example.com`]
    );
    await db.execute(
      `DELETE FROM email_suppressions WHERE user_id = ? AND source = 'smoke'`,
      [userA]
    );
  } catch (e) {
    console.warn('cleanup', e);
  }

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
