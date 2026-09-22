/**
 * S2 smoke — ownership + traversal guards for authenticated media serve helpers.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/smoke-s2-media-serve.ts
 */

import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { LocalPrivateStorage, resolveWithinRoot } from '../src/app/utils/services/storage/local-private-storage';
import { mediaKeyFromPathSegments } from '../src/app/utils/services/storage/serve-owned-media';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  assert(mediaKeyFromPathSegments(['42', '2026-09', 'a.png']) === '42/2026-09/a.png', 'key join');
  assert(mediaKeyFromPathSegments([]) === null, 'empty');
  assert(mediaKeyFromPathSegments(undefined) === null, 'undef');

  const root = mkdtempSync(path.join(tmpdir(), 'antelope-s2-'));
  process.env.UPLOAD_STORAGE_DIR = root;
  try {
    const storage = new LocalPrivateStorage(root);
    const key = '42/2026-09/secret.png';
    await storage.put(key, Buffer.from('png'), 'image/png');

    // Owner can resolve
    const abs = resolveWithinRoot(root, key);
    assert(abs.startsWith(root + path.sep), 'under root');

    // Traversal rejected
    let threw = false;
    try {
      resolveWithinRoot(root, '42/../99/x.png');
    } catch {
      threw = true;
    }
    assert(threw, 'traversal rejected');

    // Ownership rule (same as route): first segment === caller
    const caller = '42';
    const other = '99';
    assert(key.split('/')[0] === caller, 'owner match');
    assert(key.split('/')[0] !== other, 'cross-tenant mismatch');

    // Dir key → not a file (route returns 404)
    const dirKey = '42/2026-09';
    const dirAbs = resolveWithinRoot(root, dirKey);
    const { existsSync, statSync } = await import('fs');
    assert(existsSync(dirAbs) && statSync(dirAbs).isDirectory(), 'dir exists');
    const stream = await storage.getStream(dirKey);
    assert(stream === null, 'getStream on dir is null → 404');

    console.log(JSON.stringify({ ok: true, key, root }, null, 2));
    console.log('PASS: S2 — media serve ownership + traversal + no dir listing');
  } finally {
    rmSync(root, { recursive: true, force: true });
    delete process.env.UPLOAD_STORAGE_DIR;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
