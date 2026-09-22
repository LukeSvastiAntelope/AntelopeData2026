/**
 * Shared authenticated private-media serve (used by /api/media and /uploads compat).
 */

import { existsSync, statSync } from 'fs';
import { Readable } from 'stream';
import { NextRequest, NextResponse } from 'next/server';
import { assertOwnership, requireUserId } from '@/app/utils/auth/require-user';
import {
  defaultStorageRoot,
  getStorageProvider,
  resolveWithinRoot,
} from '@/app/utils/services/storage';

/** Build logical storage key from catch-all path segments. */
export function mediaKeyFromPathSegments(segments: string[] | undefined): string | null {
  if (!Array.isArray(segments) || !segments.length) return null;
  const parts = segments.map((s) => String(s || '').trim()).filter(Boolean);
  if (!parts.length) return null;
  return parts.join('/');
}

/**
 * Auth + ownership + traversal + stream from private storage.
 */
export async function serveOwnedMedia(
  req: NextRequest,
  pathSegments: string[] | undefined
): Promise<NextResponse> {
  const auth = requireUserId(req);
  if (typeof auth !== 'string') return auth;
  const callerId = auth;

  const key = mediaKeyFromPathSegments(pathSegments);
  if (!key) {
    return NextResponse.json({ status: false, message: 'Not found' }, { status: 404 });
  }

  // Ownership: first key segment must equal the caller's userId
  const ownerSegment = key.split('/')[0] || '';
  const forbidden = assertOwnership(callerId, ownerSegment);
  if (forbidden) return forbidden;

  const root = defaultStorageRoot();
  let absolute: string;
  try {
    absolute = resolveWithinRoot(root, key);
  } catch {
    return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
  }

  // No directory listing
  if (existsSync(absolute) && statSync(absolute).isDirectory()) {
    return NextResponse.json({ status: false, message: 'Not found' }, { status: 404 });
  }

  const result = await getStorageProvider().getStream(key);
  if (!result) {
    return NextResponse.json({ status: false, message: 'Not found' }, { status: 404 });
  }

  const nodeStream = result.stream as import('stream').Readable;
  const webStream =
    typeof Readable.toWeb === 'function'
      ? Readable.toWeb(nodeStream)
      : (nodeStream as unknown as ReadableStream);

  return new NextResponse(webStream as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': result.contentType || 'application/octet-stream',
      'Content-Length': String(result.sizeBytes),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
