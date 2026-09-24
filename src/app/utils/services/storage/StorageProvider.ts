/**
 * Swappable object storage contract (local private root, Vercel Blob, S3 later).
 * Server-only — never import from client components.
 */

export type StoredObject = {
  key: string;
  contentType: string;
  sizeBytes: number;
  /**
   * Public CDN (or public proxy) URL when the object was stored with
   * `access: 'public'`. Omitted for private objects — clients must use
   * `/api/media/...` via mediaObjectUrl(key) instead.
   */
  url?: string;
};

export type StoragePutOptions = {
  /** Default: private (owned media). Public = published-site assets. */
  access?: 'private' | 'public';
};

/**
 * Platform storage adapter. Implementations must read credentials / roots only
 * from server env — never from request bodies or client bundles.
 *
 * `key` is a logical path like `${userId}/${folder}/${filename}` —
 * never an absolute filesystem path.
 */
export interface StorageProvider {
  readonly name: string;
  put(
    key: string,
    data: Buffer | Uint8Array,
    contentType: string,
    options?: StoragePutOptions
  ): Promise<StoredObject>;
  getStream(key: string): Promise<{
    stream: ReadableStream | NodeJS.ReadableStream;
    contentType: string;
    sizeBytes: number;
  } | null>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<StoredObject[]>;
}

/** Folder segment marking published-site assets (public Blob / public proxy). */
export const SITE_PUBLIC_FOLDER = 'site-public';

export function isSitePublicKey(key: string): boolean {
  const parts = String(key || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .split('/');
  // `${userId}/site-public/...`
  return parts.length >= 3 && parts[1] === SITE_PUBLIC_FOLDER;
}
