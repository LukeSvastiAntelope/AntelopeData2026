/**
 * Smoke: requireUserId / assertOwnership.
 *   npx tsx --tsconfig tsconfig.json scripts/smoke-require-user.ts
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  assertOwnership,
  normalizeUserId,
  requireUserId,
} from '../src/app/utils/auth/require-user';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function main() {
  const missing = requireUserId(new NextRequest('http://x/api', { headers: {} }));
  assert(missing instanceof NextResponse && missing.status === 401, 'missing → 401');

  const blank = requireUserId(
    new NextRequest('http://x/api', { headers: { 'x-user-id': '   ' } })
  );
  assert(blank instanceof NextResponse && blank.status === 401, 'blank → 401');

  const ok = requireUserId(
    new NextRequest('http://x/api', { headers: { 'x-user-id': '42' } })
  );
  assert(ok === '42', 'ok userId');

  assert(assertOwnership('42', '42') === null, 'owner match');
  const forbid = assertOwnership('42', '99');
  assert(forbid instanceof NextResponse && forbid.status === 403, 'mismatch → 403');

  assert(normalizeUserId(' 7abc! ') === '7abc', 'normalize');
  console.log('PASS: requireUserId/assertOwnership');
}

main();
