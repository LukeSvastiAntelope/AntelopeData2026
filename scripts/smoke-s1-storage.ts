/**
 * S1 smoke — LocalPrivateStorage path safety + put/get/list/delete.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/smoke-s1-storage.ts
 */

import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import {
  LocalPrivateStorage,
  resolveWithinRoot,
} from '../src/app/utils/services/storage/local-private-storage';
import { getStorageProvider } from '../src/app/utils/services/storage';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const root = mkdtempSync(path.join(tmpdir(), 'antelope-s1-'));
  try {
    const storage = new LocalPrivateStorage(root);
    assert(storage.name === 'local-private', 'name');

    // Path safety
    const ok = resolveWithinRoot(root, 'user1/2026-09/file.png');
    assert(ok.startsWith(root + path.sep), 'under root');

    let threw = false;
    try {
      resolveWithinRoot(root, '../etc/passwd');
    } catch {
      threw = true;
    }
    assert(threw, 'rejects ..');

    threw = false;
    try {
      resolveWithinRoot(root, '/abs/path');
    } catch {
      threw = true;
    }
    assert(threw, 'rejects absolute');

    threw = false;
    try {
      resolveWithinRoot(root, 'user/../../escape');
    } catch {
      threw = true;
    }
    assert(threw, 'rejects nested ..');

    // CRUD
    const key = '42/2026-09/test.png';
    const put = await storage.put(key, Buffer.from([137, 80, 78, 71]), 'image/png');
    assert(put.key === key, 'put key');
    assert(put.contentType === 'image/png', 'contentType');
    assert(put.sizeBytes === 4, 'size');
    assert(await storage.exists(key), 'exists');

    const streamResult = await storage.getStream(key);
    assert(streamResult != null, 'getStream');
    assert(streamResult!.contentType === 'image/png', 'stream ct');
    // Drain/destroy so the FD is released before we rm the temp root
    await new Promise<void>((resolve, reject) => {
      const s = streamResult!.stream as NodeJS.ReadableStream;
      s.on('error', reject);
      s.on('end', () => resolve());
      s.on('close', () => resolve());
      s.resume();
    });

    const listed = await storage.list('42');
    assert(listed.some((o) => o.key === key), 'list prefix');

    await storage.delete(key);
    assert(!(await storage.exists(key)), 'deleted');

    // Facade
    const provider = getStorageProvider();
    assert(provider.name === 'local-private', 'getStorageProvider');

    // Must not use public/
    assert(!root.includes(`${path.sep}public${path.sep}`), 'temp root not public');
    assert(
      !process.env.UPLOAD_STORAGE_DIR ||
        !path.resolve(process.env.UPLOAD_STORAGE_DIR).includes(`${path.sep}public${path.sep}`),
      'UPLOAD_STORAGE_DIR not under public'
    );

    console.log(JSON.stringify({ ok: true, root, key }, null, 2));
    console.log('PASS: S1 — StorageProvider + LocalPrivateStorage path-safe');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
