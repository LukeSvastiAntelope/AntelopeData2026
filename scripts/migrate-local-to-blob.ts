/**
 * Migrate LocalPrivateStorage files → Vercel Blob at the same logical key.
 *
 * Dev/local carry-over: copies everything under UPLOAD_STORAGE_DIR (default
 * var/uploads) into Blob. On Vercel the old local root was ephemeral and is
 * already gone — prod is a forward fix via STORAGE_PROVIDER=vercel-blob.
 *
 * Idempotent: skips when the Blob object already exists at the same key with
 * the same size. Safe to re-run. Does not delete local files.
 *
 * Public site keys (`${userId}/site-public/...`) are put with access:public;
 * everything else is private (served only via /api/media).
 *
 *   npx tsx --tsconfig tsconfig.json -r dotenv/config scripts/migrate-local-to-blob.ts
 *
 * Requires: BLOB_READ_WRITE_TOKEN (never commit the token).
 */

import { existsSync, mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import {
  defaultStorageRoot,
  LocalPrivateStorage,
} from '../src/app/utils/services/storage/local-private-storage';
import { VercelBlobStorage } from '../src/app/utils/services/storage/vercel-blob-storage';
import { isSitePublicKey } from '../src/app/utils/services/storage/StorageProvider';

require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

type ManifestEntry = {
  key: string;
  status: 'uploaded' | 'skipped' | 'error';
  sizeBytes: number;
  access: 'private' | 'public';
  blobUrl?: string;
  error?: string;
};

async function streamToBuffer(
  stream: NodeJS.ReadableStream | ReadableStream
): Promise<Buffer> {
  if (typeof ReadableStream !== 'undefined' && stream instanceof ReadableStream) {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    return Buffer.concat(chunks.map((c) => Buffer.from(c)));
  }
  const nodeStream = stream as NodeJS.ReadableStream;
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    nodeStream.on('data', (c: Buffer | string) => {
      chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
    });
    nodeStream.on('end', () => resolve());
    nodeStream.on('error', reject);
  });
  return Buffer.concat(chunks);
}

async function main() {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) {
    console.error(
      'BLOB_READ_WRITE_TOKEN is required. Set it in .env.local (never commit the token).'
    );
    process.exit(1);
  }

  const localRoot = defaultStorageRoot();
  const local = new LocalPrivateStorage(localRoot);
  const blob = new VercelBlobStorage();

  console.log(
    JSON.stringify(
      {
        localRoot,
        blobProvider: blob.name,
        note: 'Copies local → Blob at the same key; does not delete local files.',
      },
      null,
      2
    )
  );

  if (!existsSync(localRoot)) {
    console.log('No local storage root — nothing to migrate.');
    return;
  }

  const objects = await local.list('');
  console.log(`Found ${objects.length} object(s) under local root`);

  const manifest: ManifestEntry[] = [];
  let uploaded = 0;
  let skipped = 0;
  let errors = 0;

  for (const obj of objects) {
    const access: 'private' | 'public' = isSitePublicKey(obj.key)
      ? 'public'
      : 'private';
    const sizeBytes = obj.sizeBytes;

    try {
      if (await blob.exists(obj.key)) {
        const listed = await blob.list(obj.key);
        const match = listed.find((o) => o.key === obj.key);
        if (match && match.sizeBytes === sizeBytes) {
          manifest.push({
            key: obj.key,
            status: 'skipped',
            sizeBytes,
            access,
            blobUrl: match.url,
          });
          skipped += 1;
          continue;
        }
      }

      const streamResult = await local.getStream(obj.key);
      if (!streamResult) {
        throw new Error('local getStream returned null');
      }
      const buffer = await streamToBuffer(streamResult.stream);
      const contentType = streamResult.contentType || obj.contentType;

      const stored = await blob.put(obj.key, buffer, contentType, { access });
      manifest.push({
        key: obj.key,
        status: 'uploaded',
        sizeBytes: stored.sizeBytes,
        access,
        blobUrl: stored.url,
      });
      uploaded += 1;
      console.log(`uploaded ${obj.key} (${access}, ${stored.sizeBytes} bytes)`);
    } catch (e) {
      errors += 1;
      manifest.push({
        key: obj.key,
        status: 'error',
        sizeBytes,
        access,
        error: e instanceof Error ? e.message : String(e),
      });
      console.error(
        `error ${obj.key}:`,
        e instanceof Error ? e.message : e
      );
    }
  }

  const manifestDir = path.resolve(process.cwd(), 'var');
  if (!existsSync(manifestDir)) mkdirSync(manifestDir, { recursive: true });
  const manifestPath = path.join(
    manifestDir,
    `local-to-blob-migration-manifest-${Date.now()}.json`
  );
  writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        at: new Date().toISOString(),
        localRoot,
        summary: { total: objects.length, uploaded, skipped, errors },
        entries: manifest,
      },
      null,
      2
    ),
    'utf8'
  );

  console.log(
    JSON.stringify(
      { ok: errors === 0, uploaded, skipped, errors, manifestPath },
      null,
      2
    )
  );
  console.log(
    'Done. Set STORAGE_PROVIDER=vercel-blob (+ BLOB_READ_WRITE_TOKEN) for prod.'
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
