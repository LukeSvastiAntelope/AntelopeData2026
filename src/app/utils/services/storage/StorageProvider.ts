/**
 * Swappable object storage contract (local private root, Vercel Blob, S3 later).
 * Server-only — never import from client components.
 */

export type StoredObject = {
  key: string;
  contentType: string;
  sizeBytes: number;
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
    contentType: string
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
