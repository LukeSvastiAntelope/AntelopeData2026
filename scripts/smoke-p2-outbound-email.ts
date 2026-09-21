/**
 * P2 smoke — prepare list (validate/dedupe/suppress) + in-app send receipt.
 *
 *   npx tsx --tsconfig tsconfig.json -r dotenv/config scripts/smoke-p2-outbound-email.ts
 */

import { closePool, openSql } from '../src/app/utils/database/db';
import {
  extractEmailsFromRows,
  parseEmailPaste,
  prepareRecipientList,
  validateAndDedupeEmails,
} from '../src/app/utils/services/email/recipient-list';
import {
  isResendConfigured,
  sendCandidateEmail,
} from '../src/app/utils/services/email';
import { ContactSuppressionRepo } from '../src/app/utils/database/turf-repo';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';

require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  assert(isResendConfigured(), 'RESEND_API_KEY required in .env.local');

  // Pure parse helpers
  const pasted = parseEmailPaste('a@x.com\nb@x.com, a@x.com; not-an-email\n');
  assert(pasted.length === 4, 'paste split');
  const v = validateAndDedupeEmails(pasted);
  assert(v.emails.length === 2, `deduped=${v.emails.length}`);
  assert(v.duplicateCount === 1, 'one dupe');
  assert(v.invalidCount === 1, 'one invalid');

  const fromSheet = extractEmailsFromRows([
    ['Name', 'Email', 'Note'],
    ['Ada', 'ada@example.com', 'x'],
    ['Bad', 'nope', 'y'],
    ['Ada2', 'ada@example.com', 'dupe'],
  ]);
  assert(fromSheet.includes('ada@example.com'), 'sheet extract');
  assert(fromSheet.length === 1, 'sheet dedupe');

  const db = await openSql();
  const tag = `p2_${Date.now()}`;
  const [orgs] = await db.execute<RowDataPacket[]>(
    `SELECT id FROM organizations ORDER BY id ASC LIMIT 1`
  );
  assert(orgs[0]?.id != null, 'need org');
  const orgId = Number(orgs[0].id);
  const [users] = await db.execute<RowDataPacket[]>(
    `SELECT id, email FROM users ORDER BY id ASC LIMIT 1`
  );
  const userId = Number(users[0].id);
  const to =
    process.env.SMOKE_EMAIL_TO?.trim() ||
    (users[0].email ? String(users[0].email).trim() : 'delivered@resend.dev');

  const suppressedEmail = `dnc.${tag}@example.com`;
  const [pIns] = await db.execute<ResultSetHeader>(
    `INSERT INTO person_records
      (organization_id, cluster_key, first_name, last_name, email, match_confidence)
     VALUES (?, ?, 'P2', 'DNC', ?, 0.9)`,
    [orgId, `p2-${tag}`, suppressedEmail]
  );
  const personId = Number(pIns.insertId);
  await ContactSuppressionRepo.add({
    organizationId: orgId,
    personRecordId: personId,
    reason: 'do_not_contact',
    source: 'manual',
    createdBy: userId,
  });

  const prepared = await prepareRecipientList({
    organizationId: orgId,
    raw: [to, to, 'bad', suppressedEmail, 'also@example.com'],
  });
  assert(prepared.emails.includes(to.toLowerCase()), 'keeps real to');
  assert(!prepared.emails.includes(suppressedEmail), 'drops suppressed');
  assert(prepared.suppressedCount >= 1, 'suppressed counted');
  assert(prepared.duplicateCount >= 1, 'dupes counted');
  assert(prepared.invalidCount >= 1, 'invalid counted');

  // Real send (small) — same path as /api/outbound/email/send
  const send = await sendCandidateEmail({
    fromName: 'Antelope P2 Smoke',
    localPart: 'p2-smoke',
    replyTo: 'noreply@antelopedata.org',
    to: [to],
    subject: `[Antelope P2] In-app send ${tag}`,
    html: `<p>P2 outbound email smoke (${tag}). Uploaded-list path via EmailProvider.</p>`,
  });
  assert(send.sent === 1, `sent=${send.sent} err=${send.results[0]?.error}`);
  assert(send.from.includes('@'), 'from set');

  const receipt = {
    id: `rcpt_${Date.now()}`,
    provider: send.provider,
    from: send.from,
    summary: { total: send.total, sent: send.sent, failed: send.failed },
    prepared: {
      rawCount: prepared.rawCount,
      validCount: prepared.emails.length,
      suppressedCount: prepared.suppressedCount,
    },
  };

  console.log(JSON.stringify({ ok: true, to, receipt }, null, 2));
  console.log('PASS: P2 — prepare (dedupe/suppress) + in-app platform send receipt');

  try {
    await db.execute(`DELETE FROM contact_suppression WHERE person_record_id = ?`, [
      personId,
    ]);
    await db.execute(`DELETE FROM person_records WHERE id = ?`, [personId]);
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
