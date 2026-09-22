/**
 * Platform storage facade — server-only.
 *
 * Files live outside public/ (LocalPrivateStorage → UPLOAD_STORAGE_DIR).
 * Swap providers by changing getStorageProvider() (mirror EmailProvider).
 */

import type { StorageProvider, StoredObject } from './StorageProvider';
import {
  LocalPrivateStorage,
  defaultStorageRoot,
  getLocalPrivateStorage,
  resolveWithinRoot,
} from './local-private-storage';

export type { StorageProvider, StoredObject };
export {
  LocalPrivateStorage,
  defaultStorageRoot,
  getLocalPrivateStorage,
  resolveWithinRoot,
};

/**
 * Resolve the active storage provider. Today: local private root.
 * Later: if (process.env.STORAGE_PROVIDER === 's3') return getS3Storage();
 */
export function getStorageProvider(): StorageProvider {
  return getLocalPrivateStorage();
}
