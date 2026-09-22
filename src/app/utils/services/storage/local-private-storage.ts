/**
 * LocalPrivateStorage — files under UPLOAD_STORAGE_DIR (default: <cwd>/var/uploads).
 * Outside public/ so Next/nginx never serve them as static assets.
 *
 * Path safety: resolveWithinRoot sanitizes key segments, resolves, and asserts
 * the result stays inside root + sep (same invariant as media/upload).
 */

import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
  readFileSync,
} from 'fs';
import path from 'path';
import type { StorageProvider, StoredObject } from './StorageProvider';

const META_SUFFIX = '.meta.json';

export function defaultStorageRoot(): string {
  const fromEnv = process.env.UPLOAD_STORAGE_DIR?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  return path.resolve(process.cwd(), 'var', 'uploads');
}

/**
 * Sanitize a logical storage key and resolve it under `root`.
 * Rejects absolute paths, `..`, empty segments, and anything that escapes root.
 */
export function resolveWithinRoot(root: string, key: string): string {
  const rootResolved = path.resolve(root);
  const incoming = String(key || '').replace(/\\/g, '/');
  if (!incoming || !incoming.replace(/^\/+/, '')) {
    throw new Error('storage key is required');
  }
  // Reject absolute / Windows paths before stripping leading slashes
  if (incoming.startsWith('/') || path.isAbsolute(incoming) || /^[a-zA-Z]:/.test(incoming)) {
    throw new Error('storage key must be a relative logical path');
  }
  const raw = incoming.replace(/^\/+/, '');
  if (path.isAbsolute(raw) || /^[a-zA-Z]:/.test(raw)) {
    throw new Error('storage key must be a relative logical path');
  }

  const segments = raw.split('/').filter(Boolean);
  const safe: string = (() => {
    const out: string[] = [];
    for (const seg of segments) {
      if (seg === '.' || seg === '..') {
        throw new Error('storage key contains path traversal');
      }
      // Allow alphanumerics, dash, underscore, dot (filenames / YYYY-MM folders)
      const cleaned = seg.replace(/[^a-zA-Z0-9._-]+/g, '');
      if (!cleaned || cleaned !== seg) {
        throw new Error(`invalid storage key segment: ${seg}`);
      }
      if (cleaned === '.' || cleaned === '..') {
        throw new Error('storage key contains path traversal');
      }
      out.push(cleaned);
    }
    if (!out.length) throw new Error('storage key is empty after sanitize');
    return out.join(path.sep);
  })();

  const resolved = path.resolve(rootResolved, safe);
  const prefix = rootResolved.endsWith(path.sep)
    ? rootResolved
    : `${rootResolved}${path.sep}`;
  if (resolved !== rootResolved && !resolved.startsWith(prefix)) {
    throw new Error('storage path escapes root');
  }
  return resolved;
}

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
    case '.json':
      return 'application/json';
    default:
      return 'application/octet-stream';
  }
}

function toPosixKey(key: string): string {
  return String(key || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+/g, '/');
}

type SidecarMeta = { contentType: string; sizeBytes: number };

function metaPathFor(filePath: string): string {
  return `${filePath}${META_SUFFIX}`;
}

function readSidecar(filePath: string): SidecarMeta | null {
  const mp = metaPathFor(filePath);
  if (!existsSync(mp)) return null;
  try {
    const raw = JSON.parse(readFileSync(mp, 'utf8')) as SidecarMeta;
    if (!raw || typeof raw.contentType !== 'string') return null;
    return {
      contentType: raw.contentType,
      sizeBytes: Number(raw.sizeBytes) || 0,
    };
  } catch {
    return null;
  }
}

function writeSidecar(filePath: string, meta: SidecarMeta): void {
  writeFileSync(metaPathFor(filePath), JSON.stringify(meta), 'utf8');
}

export class LocalPrivateStorage implements StorageProvider {
  readonly name = 'local-private';
  readonly root: string;

  constructor(root?: string) {
    this.root = path.resolve(root || defaultStorageRoot());
    if (!existsSync(this.root)) {
      mkdirSync(this.root, { recursive: true });
    }
  }

  async put(
    key: string,
    data: Buffer | Uint8Array,
    contentType: string
  ): Promise<StoredObject> {
    const logicalKey = toPosixKey(key);
    const filepath = resolveWithinRoot(this.root, logicalKey);
    const dir = path.dirname(filepath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    await new Promise<void>((resolve, reject) => {
      const stream = createWriteStream(filepath);
      stream.on('error', reject);
      stream.on('finish', () => resolve());
      stream.write(buf);
      stream.end();
    });

    const ct = contentType || contentTypeFromExt(filepath);
    writeSidecar(filepath, { contentType: ct, sizeBytes: buf.length });

    return { key: logicalKey, contentType: ct, sizeBytes: buf.length };
  }

  async getStream(key: string): Promise<{
    stream: NodeJS.ReadableStream;
    contentType: string;
    sizeBytes: number;
  } | null> {
    const logicalKey = toPosixKey(key);
    let filepath: string;
    try {
      filepath = resolveWithinRoot(this.root, logicalKey);
    } catch {
      return null;
    }
    if (!existsSync(filepath) || !statSync(filepath).isFile()) {
      return null;
    }
    const st = statSync(filepath);
    const sidecar = readSidecar(filepath);
    const contentType = sidecar?.contentType || contentTypeFromExt(filepath);
    return {
      stream: createReadStream(filepath),
      contentType,
      sizeBytes: sidecar?.sizeBytes || st.size,
    };
  }

  async exists(key: string): Promise<boolean> {
    try {
      const filepath = resolveWithinRoot(this.root, toPosixKey(key));
      return existsSync(filepath) && statSync(filepath).isFile();
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    const filepath = resolveWithinRoot(this.root, toPosixKey(key));
    if (existsSync(filepath)) {
      unlinkSync(filepath);
    }
    const mp = metaPathFor(filepath);
    if (existsSync(mp)) {
      unlinkSync(mp);
    }
  }

  async list(prefix: string): Promise<StoredObject[]> {
    const logicalPrefix = toPosixKey(prefix);
    // Empty prefix → list entire root; non-empty must resolve under root
    let startDir = this.root;
    if (logicalPrefix) {
      // Prefix may be a directory key (userId or userId/folder)
      try {
        startDir = resolveWithinRoot(this.root, logicalPrefix);
      } catch {
        return [];
      }
      if (!existsSync(startDir)) return [];
      const st = statSync(startDir);
      if (st.isFile()) {
        const sidecar = readSidecar(startDir);
        return [
          {
            key: logicalPrefix,
            contentType: sidecar?.contentType || contentTypeFromExt(startDir),
            sizeBytes: sidecar?.sizeBytes || st.size,
          },
        ];
      }
    }

    const out: StoredObject[] = [];
    const walk = (dir: string) => {
      let entries: string[] = [];
      try {
        entries = readdirSync(dir);
      } catch {
        return;
      }
      for (const entry of entries) {
        if (entry.endsWith(META_SUFFIX)) continue;
        const full = path.join(dir, entry);
        let st;
        try {
          st = statSync(full);
        } catch {
          continue;
        }
        if (st.isDirectory()) {
          walk(full);
          continue;
        }
        if (!st.isFile()) continue;
        const rel = path.relative(this.root, full).split(path.sep).join('/');
        const sidecar = readSidecar(full);
        out.push({
          key: rel,
          contentType: sidecar?.contentType || contentTypeFromExt(full),
          sizeBytes: sidecar?.sizeBytes || st.size,
        });
      }
    };
    walk(startDir);
    return out.sort((a, b) => a.key.localeCompare(b.key));
  }
}

let singleton: LocalPrivateStorage | null = null;

export function getLocalPrivateStorage(): LocalPrivateStorage {
  if (!singleton) singleton = new LocalPrivateStorage();
  return singleton;
}
