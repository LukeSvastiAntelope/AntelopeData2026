/**
 * Shared asset pool for Spread video studio (generate + future clip mode).
 */

import { existsSync, readdirSync, statSync } from 'fs';
import path from 'path';

export type VideoLibraryAsset = {
  id: string;
  url: string;
  type: 'image' | 'video';
  name: string;
  createdAt: string;
  sizeBytes: number;
};

function uploadsRoot(): string {
  return path.resolve(process.cwd(), 'public', 'uploads');
}

function detectType(filename: string): 'image' | 'video' | null {
  const ext = path.extname(filename).toLowerCase();
  if (['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext)) return 'image';
  if (['.mp4', '.webm', '.mov'].includes(ext)) return 'video';
  return null;
}

/**
 * List assets under public/uploads/{userId}/** for the shared pool.
 */
export function listUserMediaAssets(
  userId: number | string,
  opts?: { type?: 'image' | 'video' | 'all'; limit?: number }
): VideoLibraryAsset[] {
  const safeUserId = String(userId).replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safeUserId) return [];
  const userRoot = path.join(uploadsRoot(), safeUserId);
  if (!existsSync(userRoot)) return [];

  const out: VideoLibraryAsset[] = [];
  const walk = (dir: string) => {
    let entries: string[] = [];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
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
      const kind = detectType(entry);
      if (!kind) continue;
      if (opts?.type && opts.type !== 'all' && opts.type !== kind) continue;
      const rel = path.relative(uploadsRoot(), full).split(path.sep).join('/');
      out.push({
        id: rel,
        url: `/uploads/${rel}`,
        type: kind,
        name: entry,
        createdAt: st.mtime.toISOString(),
        sizeBytes: st.size,
      });
    }
  };
  walk(userRoot);
  return out
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, opts?.limit ?? 60);
}

/** Resolve an app-relative /uploads/... URL to an absolute URL for providers. */
export function toAbsoluteAssetUrl(url: string, appBase?: string): string {
  if (!url) return url;
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return url;
  }
  const base =
    appBase ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.AUTH_URL ||
    'http://localhost:3000';
  return `${base.replace(/\/$/, '')}${url.startsWith('/') ? url : `/${url}`}`;
}
