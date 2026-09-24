/**
 * VercelBlobStorage — StorageProvider backed by @vercel/blob.
 *
 * Logical keys (`${userId}/${folder}/${filename}`) are stored as Blob pathnames
 * with `addRandomSuffix: false` so put/getStream/exists/delete/list resolve by
 * the same key without a separate key→URL map.
 *
 * Token: BLOB_READ_WRITE_TOKEN (injected by Vercel Blob store).
 * Access: private by default (owned media via /api/media). Public site images
 * use `put(..., { access: 'public' })` and return the Blob CDN URL.
 */

import {
  put,
  head,
  del,
  list,
  get,
  BlobNotFoundError,
} from '@vercel/blob';
import type {
  StorageProvider,
  StoredObject,
  StoragePutOptions,
} from './StorageProvider';

function toPosixKey(key: string): string {
  return String(key || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+/g, '/');
}

/**
 * Sanitize a logical key the same way LocalPrivateStorage does (relative,
 * no traversal, safe segments) — without tying to a filesystem root.
 */
export function sanitizeBlobKey(key: string): string {
  const incoming = String(key || '').replace(/\\/g, '/');
  if (!incoming || !incoming.replace(/^\/+/, '')) {
    throw new Error('storage key is required');
  }
  if (
    incoming.startsWith('/') ||
    /^[a-zA-Z]:/.test(incoming) ||
    incoming.includes('\\')
  ) {
    throw new Error('storage key must be a relative logical path');
  }
  const raw = incoming.replace(/^\/+/, '');
  const segments = raw.split('/').filter(Boolean);
  const out: string[] = [];
  for (const seg of segments) {
    if (seg === '.' || seg === '..') {
      throw new Error('storage key contains path traversal');
    }
    const cleaned = seg.replace(/[^a-zA-Z0-9._-]+/g, '');
    if (!cleaned || cleaned !== seg) {
      throw new Error(`invalid storage key segment: ${seg}`);
    }
    out.push(cleaned);
  }
  if (!out.length) throw new Error('storage key is empty after sanitize');
  return out.join('/');
}

function blobToken(): string {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) {
    throw new Error(
      'BLOB_READ_WRITE_TOKEN is required when STORAGE_PROVIDER=vercel-blob'
    );
  }
  return token;
}

export class VercelBlobStorage implements StorageProvider {
  readonly name = 'vercel-blob';

  async put(
    key: string,
    data: Buffer | Uint8Array,
    contentType: string,
    options?: StoragePutOptions
  ): Promise<StoredObject> {
    const logicalKey = sanitizeBlobKey(toPosixKey(key));
    const access = options?.access === 'public' ? 'public' : 'private';
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const ct = contentType || 'application/octet-stream';
    const token = blobToken();

    const result = await put(logicalKey, buf, {
      access,
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: ct,
      token,
    });

    const stored: StoredObject = {
      key: result.pathname || logicalKey,
      contentType: result.contentType || ct,
      sizeBytes: buf.length,
    };
    if (access === 'public' && result.url) {
      stored.url = result.url;
    }
    return stored;
  }

  async getStream(key: string): Promise<{
    stream: ReadableStream | NodeJS.ReadableStream;
    contentType: string;
    sizeBytes: number;
  } | null> {
    let logicalKey: string;
    try {
      logicalKey = sanitizeBlobKey(toPosixKey(key));
    } catch {
      return null;
    }

    // Private media first (owned /api/media path); fall back to public for
    // rare cross-reads of site assets via the same key.
    for (const access of ['private', 'public'] as const) {
      try {
        const result = await get(logicalKey, {
          access,
          token: blobToken(),
        });
        if (!result || result.statusCode !== 200 || !result.stream) {
          continue;
        }
        return {
          stream: result.stream,
          contentType: result.blob.contentType || 'application/octet-stream',
          sizeBytes: Number(result.blob.size) || 0,
        };
      } catch (err) {
        if (err instanceof BlobNotFoundError) continue;
        const msg = err instanceof Error ? err.message : String(err);
        if (/not found|404/i.test(msg)) continue;
        throw err;
      }
    }
    return null;
  }

  async exists(key: string): Promise<boolean> {
    let logicalKey: string;
    try {
      logicalKey = sanitizeBlobKey(toPosixKey(key));
    } catch {
      return false;
    }
    try {
      await head(logicalKey, { token: blobToken() });
      return true;
    } catch (err) {
      if (err instanceof BlobNotFoundError) return false;
      const msg = err instanceof Error ? err.message : String(err);
      if (/not found|404/i.test(msg)) return false;
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    const logicalKey = sanitizeBlobKey(toPosixKey(key));
    try {
      await del(logicalKey, { token: blobToken() });
    } catch (err) {
      if (err instanceof BlobNotFoundError) return;
      const msg = err instanceof Error ? err.message : String(err);
      if (/not found|404/i.test(msg)) return;
      throw err;
    }
  }

  async list(prefix: string): Promise<StoredObject[]> {
    const logicalPrefix = toPosixKey(prefix);
    let safePrefix = '';
    if (logicalPrefix) {
      try {
        safePrefix = sanitizeBlobKey(logicalPrefix);
      } catch {
        return [];
      }
    }

    const token = blobToken();
    const out: StoredObject[] = [];
    let cursor: string | undefined;

    do {
      const page = await list({
        prefix: safePrefix || undefined,
        token,
        cursor,
        limit: 1000,
      });
      for (const blob of page.blobs || []) {
        const pathname = String(blob.pathname || '');
        if (!pathname) continue;
        out.push({
          key: pathname.replace(/^\/+/, ''),
          contentType:
            (blob as { contentType?: string }).contentType ||
            contentTypeFromPath(pathname),
          sizeBytes: Number(blob.size) || 0,
          url: blob.url || undefined,
        });
      }
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);

    return out.sort((a, b) => a.key.localeCompare(b.key));
  }
}

function contentTypeFromPath(filePath: string): string {
  const ext = filePath.includes('.')
    ? `.${filePath.split('.').pop()!.toLowerCase()}`
    : '';
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

let singleton: VercelBlobStorage | null = null;

export function getVercelBlobStorage(): VercelBlobStorage {
  if (!singleton) singleton = new VercelBlobStorage();
  return singleton;
}
