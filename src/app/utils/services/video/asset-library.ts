/**
 * Shared asset pool for Spread video studio (generate + future clip mode).
 * Backed by StorageProvider (private root) — URLs are authenticated /api/media/...
 */

import path from 'path';
import {
  getStorageProvider,
  mediaObjectUrl,
  sanitizeStorageUserId,
} from '@/app/utils/services/storage';

export type VideoLibraryAsset = {
  id: string;
  url: string;
  type: 'image' | 'video';
  name: string;
  createdAt: string;
  sizeBytes: number;
};

function detectType(filename: string): 'image' | 'video' | null {
  const ext = path.extname(filename).toLowerCase();
  if (['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext)) return 'image';
  if (['.mp4', '.webm', '.mov'].includes(ext)) return 'video';
  return null;
}

/**
 * List assets under storage prefix `{userId}/**` for the shared pool.
 */
export async function listUserMediaAssets(
  userId: number | string,
  opts?: { type?: 'image' | 'video' | 'all'; limit?: number }
): Promise<VideoLibraryAsset[]> {
  const safeUserId = sanitizeStorageUserId(userId);
  if (!safeUserId) return [];

  const objects = await getStorageProvider().list(safeUserId);
  const out: VideoLibraryAsset[] = [];
  for (const obj of objects) {
    const name = obj.key.split('/').pop() || obj.key;
    const kind = detectType(name);
    if (!kind) continue;
    if (opts?.type && opts.type !== 'all' && opts.type !== kind) continue;
    out.push({
      id: obj.key,
      url: mediaObjectUrl(obj.key),
      type: kind,
      name,
      createdAt: new Date(0).toISOString(),
      sizeBytes: obj.sizeBytes,
    });
  }

  // Prefer newer keys (timestamp prefix in filename) by sorting key desc
  return out
    .sort((a, b) => b.id.localeCompare(a.id))
    .slice(0, opts?.limit ?? 60);
}

/**
 * Resolve an app-relative media URL to an absolute URL for providers.
 * Accepts legacy `/uploads/...` and current `/api/media/...`.
 */
export function toAbsoluteAssetUrl(url: string, appBase?: string): string {
  if (!url) return url;
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return url;
  }
  // Normalize legacy public path → authenticated serve path
  let normalized = url;
  if (normalized.startsWith('/uploads/')) {
    normalized = `/api/media/${normalized.slice('/uploads/'.length)}`;
  }
  const base =
    appBase ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.AUTH_URL ||
    'http://localhost:3000';
  return `${base.replace(/\/$/, '')}${normalized.startsWith('/') ? normalized : `/${normalized}`}`;
}
