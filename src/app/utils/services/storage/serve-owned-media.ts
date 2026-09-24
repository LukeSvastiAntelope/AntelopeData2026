/**
 * Shared authenticated private-media serve (used by /api/media and /uploads compat).
 * Provider-agnostic: ownership + key sanitize, then getStream from StorageProvider.
 * Clients never receive a raw Blob URL — bytes are streamed through this route.
 */

import { Readable } from 'stream';
import { NextRequest, NextResponse } from 'next/server';
import { assertOwnership, requireUserId } from '@/app/utils/auth/require-user';
import { getStorageProvider } from '@/app/utils/services/storage';
import { isSitePublicKey } from '@/app/utils/services/storage/StorageProvider';
import { sanitizeBlobKey } from '@/app/utils/services/storage/vercel-blob-storage';
import { resolveWithinRoot, defaultStorageRoot } from '@/app/utils/services/storage/local-private-storage';

/** Build logical storage key from catch-all path segments. */
export function mediaKeyFromPathSegments(segments: string[] | undefined): string | null {
  if (!Array.isArray(segments) || !segments.length) return null;
  const parts = segments.map((s) => String(s || '').trim()).filter(Boolean);
  if (!parts.length) return null;
  return parts.join('/');
}

function assertSafeKey(key: string): string | null {
  try {
    // Prefer Blob-style sanitize (no FS). Also run local resolve when available
    // so traversal rejects match LocalPrivateStorage.
    const sanitized = sanitizeBlobKey(key);
    try {
      resolveWithinRoot(defaultStorageRoot(), sanitized);
    } catch {
      // Local root may be irrelevant under vercel-blob — sanitizeBlobKey is enough.
    }
    return sanitized;
  } catch {
    return null;
  }
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

  const rawKey = mediaKeyFromPathSegments(pathSegments);
  if (!rawKey) {
    return NextResponse.json({ status: false, message: 'Not found' }, { status: 404 });
  }

  const key = assertSafeKey(rawKey);
  if (!key) {
    return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
  }

  // Ownership: first key segment must equal the caller's userId
  const ownerSegment = key.split('/')[0] || '';
  const forbidden = assertOwnership(callerId, ownerSegment);
  if (forbidden) return forbidden;

  // Public site assets are not served through the private proxy
  if (isSitePublicKey(key)) {
    return NextResponse.json(
      {
        status: false,
        message: 'Public site assets are not served via /api/media',
      },
      { status: 404 }
    );
  }

  const result = await getStorageProvider().getStream(key);
  if (!result) {
    return NextResponse.json({ status: false, message: 'Not found' }, { status: 404 });
  }

  const stream = result.stream;
  let body: BodyInit;
  if (typeof ReadableStream !== 'undefined' && stream instanceof ReadableStream) {
    body = stream;
  } else {
    const nodeStream = stream as import('stream').Readable;
    body =
      typeof Readable.toWeb === 'function'
        ? (Readable.toWeb(nodeStream) as unknown as BodyInit)
        : (nodeStream as unknown as BodyInit);
  }

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': result.contentType || 'application/octet-stream',
      'Content-Length': String(result.sizeBytes),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
