/**
 * GET /api/media/[...path]
 *
 * Authenticated serve for private uploads. Never world-readable.
 * Ownership: first key segment must equal the caller's userId.
 */

import { Readable } from 'stream';
import { NextRequest, NextResponse } from 'next/server';
import {
  defaultStorageRoot,
  getStorageProvider,
  resolveWithinRoot,
} from '@/app/utils/services/storage';
import { existsSync, statSync } from 'fs';
export const runtime = 'nodejs';

function sanitizeUserId(raw: string): string {
  return String(raw || '').replace(/[^a-zA-Z0-9_-]/g, '');
}

/** Build logical storage key from catch-all path segments. */
export function mediaKeyFromPathSegments(segments: string[] | undefined): string | null {
  if (!Array.isArray(segments) || !segments.length) return null;
  const parts = segments
    .map((s) => String(s || '').trim())
    .filter(Boolean);
  if (!parts.length) return null;
  return parts.join('/');
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ path?: string[] }> }
) {
  try {
    const userIdHeader = req.headers.get('x-user-id');
    if (!userIdHeader) {
      return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
    }
    const callerId = sanitizeUserId(userIdHeader);
    if (!callerId) {
      return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
    }

    const { path: pathSegments } = await context.params;
    const key = mediaKeyFromPathSegments(pathSegments);
    if (!key) {
      return NextResponse.json({ status: false, message: 'Not found' }, { status: 404 });
    }

    // Ownership: first segment must equal caller (tenant isolation)
    const ownerSegment = key.split('/')[0] || '';
    if (ownerSegment !== callerId) {
      return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
    }

    // Traversal / escape guard
    const root = defaultStorageRoot();
    let absolute: string;
    try {
      absolute = resolveWithinRoot(root, key);
    } catch {
      return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
    }

    // No directory listing — dirs are 404
    if (existsSync(absolute) && statSync(absolute).isDirectory()) {
      return NextResponse.json({ status: false, message: 'Not found' }, { status: 404 });
    }

    const storage = getStorageProvider();
    const result = await storage.getStream(key);
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
  } catch (err) {
    console.error('[media/serve]', err instanceof Error ? err.message : 'error');
    return NextResponse.json({ status: false, message: 'Serve failed' }, { status: 500 });
  }
}
