/**
 * Migrate public/uploads/** → private StorageProvider root (var/uploads by default).
 *
 * Preserves relative keys (${userId}/${folder}/${filename} when already shaped
 * that way; flat legacy files keep their relative path).
 *
 * Idempotent: skips if the destination key already exists with the same size.
 * Safe to re-run. Moves files (unlink source after successful put).
 *
 *   npx tsx --tsconfig tsconfig.json -r dotenv/config scripts/migrate-uploads-to-private.ts
 *
 * Ops: run once on the server after deploy. Ensure nginx does not autoindex or
 * serve the private root (UPLOAD_STORAGE_DIR / var/uploads).
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
  readFileSync,
} from 'fs';
import path from 'path';
import {
  defaultStorageRoot,
  resolveWithinRoot,
} from '../src/app/utils/services/storage/local-private-storage';

require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

type ManifestEntry = {
  source: string;
  key: string;
  status: 'moved' | 'skipped' | 'error';
  sizeBytes: number;
  error?: string;
};

function contentTypeFromExt(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.mp4':
      return 'video/mp4';
    case '.webm':
      return 'video/webm';
    case '.mov':
      return 'video/quicktime';
    default:
      return 'application/octet-stream';
  }
}

function walkFiles(dir: string, base: string, out: string[]) {
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.startsWith('.')) continue;
    const full = path.join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walkFiles(full, base, out);
    else if (st.isFile()) out.push(full);
  }
}

function toPosixRel(from: string, file: string): string {
  return path.relative(from, file).split(path.sep).join('/');
}

async function main() {
  const publicRoot = path.resolve(process.cwd(), 'public', 'uploads');
  const privateRoot = defaultStorageRoot();

  console.log(JSON.stringify({ publicRoot, privateRoot }, null, 2));

  if (!existsSync(publicRoot)) {
    console.log('No public/uploads directory — nothing to migrate.');
    return;
  }
  if (!existsSync(privateRoot)) {
    mkdirSync(privateRoot, { recursive: true });
  }

  const files: string[] = [];
  walkFiles(publicRoot, publicRoot, files);
  console.log(`Found ${files.length} file(s) under public/uploads`);

  const manifest: ManifestEntry[] = [];
  let moved = 0;
  let skipped = 0;
  let errors = 0;

  for (const source of files) {
    const key = toPosixRel(publicRoot, source);
    const sizeBytes = statSync(source).size;
    try {
      // Validate key is path-safe under private root
      const dest = resolveWithinRoot(privateRoot, key);
      const destDir = path.dirname(dest);
      if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });

      if (existsSync(dest)) {
        const destSize = statSync(dest).size;
        if (destSize === sizeBytes) {
          // Idempotent skip — remove leftover public copy if still present
          unlinkSync(source);
          manifest.push({ source, key, status: 'skipped', sizeBytes });
          skipped += 1;
          continue;
        }
        // Different size — overwrite private with public source
        unlinkSync(dest);
      }

      // Prefer rename within same FS; fall back to copy+unlink
      try {
        renameSync(source, dest);
      } catch {
        const data = readFileSync(source);
        writeFileSync(dest, data);
        unlinkSync(source);
      }

      // Sidecar meta for LocalPrivateStorage content-type
      const meta = {
        contentType: contentTypeFromExt(dest),
        sizeBytes,
      };
      writeFileSync(`${dest}.meta.json`, JSON.stringify(meta), 'utf8');

      manifest.push({ source, key, status: 'moved', sizeBytes });
      moved += 1;
    } catch (e) {
      errors += 1;
      manifest.push({
        source,
        key,
        status: 'error',
        sizeBytes,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // Prune empty dirs under public/uploads (best effort)
  const prune = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) prune(full);
    }
    try {
      if (readdirSync(dir).length === 0 && dir !== publicRoot) {
        // leave public/uploads itself (gitignored placeholder)
        const { rmdirSync } = require('fs');
        rmdirSync(dir);
      }
    } catch {
      /* ignore */
    }
  };
  prune(publicRoot);

  const manifestPath = path.resolve(
    process.cwd(),
    'var',
    `upload-migration-manifest-${Date.now()}.json`
  );
  mkdirSync(path.dirname(manifestPath), { recursive: true });
  writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        at: new Date().toISOString(),
        publicRoot,
        privateRoot,
        summary: { total: files.length, moved, skipped, errors },
        entries: manifest,
      },
      null,
      2
    ),
    'utf8'
  );

  console.log(
    JSON.stringify(
      { ok: errors === 0, moved, skipped, errors, manifestPath },
      null,
      2
    )
  );
  console.log(
    'Done. Legacy /uploads/... URLs are auth-gated via app/uploads/[...path] compat route.'
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
