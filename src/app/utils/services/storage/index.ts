/**
 * Platform storage facade — server-only.
 *
 * Files live outside public/ by default (LocalPrivateStorage → UPLOAD_STORAGE_DIR).
 * Prod on Vercel: STORAGE_PROVIDER=vercel-blob (+ BLOB_READ_WRITE_TOKEN from a Blob store).
 * Swap providers here (mirror EmailProvider).
 */

import type {
  StorageProvider,
  StoredObject,
  StoragePutOptions,
} from './StorageProvider';
import {
  LocalPrivateStorage,
  defaultStorageRoot,
  getLocalPrivateStorage,
  resolveWithinRoot,
} from './local-private-storage';
import {
  VercelBlobStorage,
  getVercelBlobStorage,
  sanitizeBlobKey,
} from './vercel-blob-storage';

export type { StorageProvider, StoredObject, StoragePutOptions };
export {
  SITE_PUBLIC_FOLDER,
  isSitePublicKey,
} from './StorageProvider';
export {
  LocalPrivateStorage,
  defaultStorageRoot,
  getLocalPrivateStorage,
  resolveWithinRoot,
  VercelBlobStorage,
  getVercelBlobStorage,
  sanitizeBlobKey,
};

/**
 * Resolve the active storage provider.
 * - STORAGE_PROVIDER=vercel-blob → Vercel Blob (prod)
 * - otherwise → LocalPrivateStorage (dev default)
 */
export function getStorageProvider(): StorageProvider {
  if (process.env.STORAGE_PROVIDER === 'vercel-blob') {
    return getVercelBlobStorage();
  }
  return getLocalPrivateStorage();
}

export { serveOwnedMedia, mediaKeyFromPathSegments } from './serve-owned-media';

/** Sanitize user id for use as the first key segment (tenant scope). */
export function sanitizeStorageUserId(userId: string | number): string {
  return String(userId).replace(/[^a-zA-Z0-9_-]/g, '');
}

/** YYYY-MM folder segment (existing upload scheme). */
export function mediaMonthFolder(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Logical key: `${safeUserId}/${folder}/${filename}` — never an absolute path.
 */
export function buildMediaKey(opts: {
  userId: string | number;
  filename: string;
  folder?: string;
}): string {
  const safeUserId = sanitizeStorageUserId(opts.userId);
  if (!safeUserId) throw new Error('invalid user id for storage key');
  const folder = opts.folder || mediaMonthFolder();
  const filename = String(opts.filename || '')
    .replace(/\\/g, '/')
    .split('/')
    .pop()!
    .replace(/[^a-zA-Z0-9._-]+/g, '');
  if (!filename) throw new Error('invalid filename for storage key');
  return `${safeUserId}/${folder}/${filename}`;
}

/** Authenticated serve URL for a stored object key. */
export function mediaObjectUrl(key: string): string {
  const k = String(key || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
  return `/api/media/${k}`;
}
