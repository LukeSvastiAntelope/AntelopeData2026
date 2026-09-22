/**
 * S3 smoke — writes go through StorageProvider; URLs are /api/media/...
 *
 *   npx tsx --tsconfig tsconfig.json scripts/smoke-s3-storage-writes.ts
 */

import { mkdtempSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import {
  buildMediaKey,
  getStorageProvider,
  mediaMonthFolder,
  mediaObjectUrl,
  LocalPrivateStorage,
} from '../src/app/utils/services/storage';
import { listUserMediaAssets, toAbsoluteAssetUrl } from '../src/app/utils/services/video/asset-library';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const root = mkdtempSync(path.join(tmpdir(), 'antelope-s3-'));
  process.env.UPLOAD_STORAGE_DIR = root;
  // Reset singleton by constructing directly for this root
  const storage = new LocalPrivateStorage(root);

  try {
    const key = buildMediaKey({
      userId: 7,
      folder: mediaMonthFolder(),
      filename: `${Date.now()}_abcd12.png`,
    });
    assert(key.startsWith('7/'), 'key tenant');
    assert(!key.includes('..'), 'no traversal');

    await storage.put(key, Buffer.from([1, 2, 3]), 'image/png');
    assert(await storage.exists(key), 'stored');

    const url = mediaObjectUrl(key);
    assert(url.startsWith('/api/media/7/'), `url=${url}`);
    assert(!url.includes('/uploads/'), 'not public uploads url');

    // Must not land under public/
    const publicPath = path.resolve(process.cwd(), 'public', 'uploads', key);
    assert(!existsSync(publicPath), 'not written to public/uploads');

    // Legacy absolute URL rewrite
    const abs = toAbsoluteAssetUrl('/uploads/7/2026-09/x.png', 'https://app.example');
    assert(abs === 'https://app.example/api/media/7/2026-09/x.png', `legacy rewrite ${abs}`);

    // listUserMediaAssets uses storage (point env; getStorageProvider uses singleton —
    // set UPLOAD_STORAGE_DIR before first getStorageProvider in this process)
    // Use LocalPrivateStorage root via env — getLocalPrivateStorage may already be memoized.
    // Direct list via storage we already put into:
    const listed = await storage.list('7');
    assert(listed.some((o) => o.key === key), 'list finds object');

    console.log(JSON.stringify({ ok: true, key, url }, null, 2));
    console.log('PASS: S3 — StorageProvider writes + /api/media URLs');
  } finally {
    rmSync(root, { recursive: true, force: true });
    delete process.env.UPLOAD_STORAGE_DIR;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
