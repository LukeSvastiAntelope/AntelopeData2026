/**
 * Admin A4 smoke — time-boxed support impersonation (start/stop/expiry/audit).
 *
 *   npx tsx --tsconfig tsconfig.json -r dotenv/config scripts/smoke-a4-support.ts
 */

require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

import { NextRequest } from 'next/server';
import {
  AdminSupportRepo,
  SUPPORT_DEFAULT_MINUTES,
  SUPPORT_MAX_MINUTES,
} from '../src/app/utils/database/admin-support-repo';
import {
  publicSupportPayload,
  resolveSupportSession,
} from '../src/app/utils/auth/support-session';
import {
  signSupportCtx,
  verifySupportCtx,
} from '../src/app/utils/auth/support-ctx-cookie';
import { openSql, closePool } from '../src/app/utils/database/db';
import { listAdminAuditLog } from '../src/app/utils/database/admin-audit-repo';
import type { RowDataPacket } from 'mysql2/promise';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  assert(SUPPORT_DEFAULT_MINUTES === 30, 'default 30m');
  assert(SUPPORT_MAX_MINUTES === 120, 'max 2h');

  console.log('--- signed ctx cookie ---');
  const exp = Date.now() + 60_000;
  const token = await signSupportCtx({
    sid: '00000000-0000-4000-8000-000000000001',
    mode: 'read',
    orgId: 42,
    orgName: 'Test Org',
    exp,
  });
  assert(!!token, 'signed token');
  const verified = await verifySupportCtx(token);
  assert(verified?.orgId === 42, 'verify orgId');
  assert(verified?.mode === 'read', 'verify mode');
  assert(!(await verifySupportCtx('tampered.' + token)), 'reject bad token');
  console.log('ctx cookie ok');

  const sql = await openSql();

  // Ensure table exists (migration may not have run)
  const [tables] = await sql.execute<RowDataPacket[]>(
    `SELECT TABLE_NAME FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admin_support_sessions'`
  );
  assert(tables.length === 1, 'admin_support_sessions table missing — run migration');

  const [orgs] = await sql.execute<RowDataPacket[]>(
    `SELECT id, name FROM organizations ORDER BY id ASC LIMIT 1`
  );
  assert(orgs.length > 0, 'need an organization');
  const org = orgs[0];

  const [users] = await sql.execute<RowDataPacket[]>(
    `SELECT id, email FROM users ORDER BY id ASC LIMIT 1`
  );
  assert(users.length > 0, 'need a user');
  const actor = users[0];

  console.log('--- start session ---');
  const session = await AdminSupportRepo.start({
    actorUserId: Number(actor.id),
    actorEmail: String(actor.email || 'smoke@test'),
    targetOrganizationId: Number(org.id),
    targetOrganizationName: String(org.name),
    mode: 'read',
    durationMinutes: 15,
  });
  assert(session.active, 'session active');
  assert(session.mode === 'read', 'mode read');
  assert(
    session.targetOrganizationId === Number(org.id),
    'target org'
  );
  const payload = publicSupportPayload(session);
  assert(payload.remainingSeconds > 0, 'remaining > 0');
  console.log('started', {
    id: session.id,
    org: session.targetOrganizationName,
    expiresAt: session.expiresAt,
  });

  console.log('--- resolve via cookie ---');
  const req = new NextRequest('http://localhost/api/support/session', {
    headers: {
      cookie: `antelope_support_sid=${session.id}`,
      'x-user-id': String(actor.id),
    },
  });
  const resolved = await resolveSupportSession(req, {
    actorUserId: Number(actor.id),
  });
  assert(!!resolved && resolved.id === session.id, 'resolve cookie');

  console.log('--- end session ---');
  const ended = await AdminSupportRepo.end(session.id, 'manual');
  assert(!!ended?.endedAt, 'ended_at set');
  assert(ended!.endReason === 'manual', 'end reason');
  assert(
    typeof ended!.durationSeconds === 'number' && ended!.durationSeconds >= 0,
    'duration recorded'
  );
  console.log('ended', {
    durationSeconds: ended!.durationSeconds,
    endReason: ended!.endReason,
  });

  const after = await resolveSupportSession(req, {
    actorUserId: Number(actor.id),
  });
  assert(after === null, 'ended session no longer resolves');

  // Write mode requires confirm at API layer — repo allows creation for smoke
  const writeSession = await AdminSupportRepo.start({
    actorUserId: Number(actor.id),
    actorEmail: String(actor.email || 'smoke@test'),
    targetOrganizationId: Number(org.id),
    targetOrganizationName: String(org.name),
    mode: 'write',
    durationMinutes: 5,
  });
  assert(writeSession.mode === 'write', 'write mode');
  await AdminSupportRepo.end(writeSession.id, 'manual');

  // Audit table exists (A1); listing should work
  const audit = await listAdminAuditLog({ limit: 5 });
  assert(Array.isArray(audit.entries), 'audit list');

  console.log('A4 smoke PASSED');
  await closePool();
}

main().catch(async (err) => {
  console.error('A4 smoke FAILED', err);
  try {
    await closePool();
  } catch {}
  process.exit(1);
});
