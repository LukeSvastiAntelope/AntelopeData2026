/**
 * GET /api/public/site-media/[...path]
 * Unauthenticated serve for published-site images (local/dev proxy).
 * Only keys under `${userId}/site-public/...` are allowed.
 * On Vercel Blob, site images use the CDN URL directly — this route is the
 * local fallback when STORAGE_PROVIDER is local-private.
 */

import { Readable } from 'stream';
import { NextRequest, NextResponse } from 'next/server';
import {
  getStorageProvider,
  mediaKeyFromPathSegments,
} from '@/app/utils/services/storage';
import { isSitePublicKey } from '@/app/utils/services/storage/StorageProvider';
import { sanitizeBlobKey } from '@/app/utils/services/storage/vercel-blob-storage';

export const runtime = 'nodejs';

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ path?: string[] }> }
) {
  try {
    const { path: pathSegments } = await context.params;
    const rawKey = mediaKeyFromPathSegments(pathSegments);
    if (!rawKey) {
      return NextResponse.json({ status: false, message: 'Not found' }, { status: 404 });
    }

    let key: string;
    try {
      key = sanitizeBlobKey(rawKey);
    } catch {
      return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
    }

    if (!isSitePublicKey(key)) {
      return NextResponse.json({ status: false, message: 'Not found' }, { status: 404 });
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
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    console.error('[public/site-media]', err);
    return NextResponse.json({ status: false, message: 'Serve failed' }, { status: 500 });
  }
}
