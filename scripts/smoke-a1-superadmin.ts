/**
 * Admin A1 smoke — email allowlist + requireSuperAdmin gate + audit log write/list.
 *
 *   npx tsx --tsconfig tsconfig.json -r dotenv/config scripts/smoke-a1-superadmin.ts
 */

require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

import { NextRequest } from 'next/server';
import {
  DEFAULT_SUPERADMIN_EMAIL,
  getSuperAdminEmails,
  isSuperAdminEmail,
} from '../src/app/utils/auth/super-admin';
import { requireSuperAdmin } from '../src/app/utils/auth/require-super-admin';
import {
  listAdminAuditLog,
  writeAdminAuditLog,
} from '../src/app/utils/database/admin-audit-repo';
import { openSql, closePool } from '../src/app/utils/database/db';
import type { RowDataPacket } from 'mysql2/promise';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  console.log('--- allowlist ---');
  assert(
    getSuperAdminEmails().includes(DEFAULT_SUPERADMIN_EMAIL),
    'default email always present'
  );
  assert(isSuperAdminEmail('lukesvasti@antelope.org'), 'exact match');
  assert(isSuperAdminEmail('LukeSvasti@Antelope.org'), 'case-insensitive');
  assert(!isSuperAdminEmail('lukesvasti@gmail.com'), 'gmail is not super-admin');
  assert(!isSuperAdminEmail('admin@example.com'), 'random not super-admin');
  assert(!isSuperAdminEmail(null), 'null rejected');
  console.log('allowlist ok', getSuperAdminEmails());

  console.log('--- requireSuperAdmin ---');
  const bare = new NextRequest('http://localhost/api/admin/users');
  const denied = await requireSuperAdmin(bare);
  assert(
    denied instanceof Response && denied.status === 401,
    'missing user → 401'
  );

  const sql = await openSql();
  const [users] = await sql.execute<RowDataPacket[]>(
    `SELECT id, email, is_verified FROM users ORDER BY id ASC LIMIT 5`
  );
  assert(users.length > 0, 'need at least one user');

  // Non-allowlisted user (prefer gmail / non-antelope.org)
  const nonAdmin =
    users.find(
      (u) =>
        !isSuperAdminEmail(String(u.email)) && Number(u.is_verified) !== 0
    ) || users.find((u) => !isSuperAdminEmail(String(u.email)));
  if (nonAdmin) {
    const req = new NextRequest('http://localhost/api/admin/users', {
      headers: { 'x-user-id': String(nonAdmin.id) },
    });
    const res = await requireSuperAdmin(req);
    assert(
      res instanceof Response && res.status === 403,
      `non-allowlisted ${nonAdmin.email} → 403`
    );
    console.log('non-allowlisted denied:', nonAdmin.email);
  }

  // Allowlisted user if present
  const pinned = users.find((u) =>
    isSuperAdminEmail(String(u.email))
  );
  if (pinned && Number(pinned.is_verified) !== 0) {
    const req = new NextRequest('http://localhost/api/admin/users', {
      headers: { 'x-user-id': String(pinned.id) },
    });
    const ctx = await requireSuperAdmin(req);
    assert(!(ctx instanceof Response), 'pinned email passes');
    assert(
      (ctx as any).email === String(pinned.email).toLowerCase(),
      'email on context'
    );
    console.log('pinned user passes:', pinned.email);

    await writeAdminAuditLog({
      actorUserId: Number(pinned.id),
      action: 'smoke.a1',
      targetType: 'system',
      metadata: { ok: true },
      ip: '127.0.0.1',
    });
    const { entries, total } = await listAdminAuditLog({ limit: 5 });
    assert(total >= 1, 'audit has rows');
    assert(
      entries.some((e) => e.action === 'smoke.a1'),
      'smoke entry present'
    );
    console.log('audit write/list ok', { total, latest: entries[0]?.action });
  } else {
    console.log(
      'NOTE: no verified lukesvasti@antelope.org user in DB yet — gate logic still verified via denials'
    );
    // Still exercise audit table with any user id for write path
    await writeAdminAuditLog({
      actorUserId: Number(users[0].id),
      action: 'smoke.a1',
      targetType: 'system',
      metadata: { note: 'actor may not be superadmin — write path only' },
      ip: '127.0.0.1',
    });
    const { total } = await listAdminAuditLog({ limit: 1 });
    assert(total >= 1, 'audit table writable');
    console.log('audit table ok', { total });
  }

  console.log('A1 smoke PASSED');
  await closePool();
}

main().catch(async (err) => {
  console.error('A1 smoke FAILED', err);
  try {
    await closePool();
  } catch {}
  process.exit(1);
});
