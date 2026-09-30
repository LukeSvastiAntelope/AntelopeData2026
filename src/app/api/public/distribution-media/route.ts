/**
 * GET /api/public/distribution-media?token=...
 * Time-limited signed fetch for Zapier/Make — streams private media bytes.
 */

import { Readable } from 'stream';
import { NextRequest, NextResponse } from 'next/server';
import { verifyDistributionMediaToken } from '@/app/utils/services/distribution-media-token';
import { getStorageProvider } from '@/app/utils/services/storage';
import { sanitizeBlobKey } from '@/app/utils/services/storage/vercel-blob-storage';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get('token');
    const claims = verifyDistributionMediaToken(token);
    if (!claims) {
      return NextResponse.json(
        { status: false, message: 'Invalid or expired media token' },
        { status: 401 }
      );
    }

    let key: string;
    try {
      key = sanitizeBlobKey(claims.key);
    } catch {
      return NextResponse.json(
        { status: false, message: 'Invalid media key' },
        { status: 400 }
      );
    }

    // Token is bound to owner userId — first key segment must match
    const owner = key.split('/')[0] || '';
    if (String(claims.userId) !== owner) {
      return NextResponse.json(
        { status: false, message: 'Forbidden' },
        { status: 403 }
      );
    }

    const result = await getStorageProvider().getStream(key);
    if (!result) {
      return NextResponse.json(
        { status: false, message: 'Not found' },
        { status: 404 }
      );
    }

    const stream = result.stream;
    let body: BodyInit;
    if (
      typeof ReadableStream !== 'undefined' &&
      stream instanceof ReadableStream
    ) {
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
        'Cache-Control': 'private, max-age=300',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    console.error(
      '[public/distribution-media]',
      err instanceof Error ? err.message : err
    );
    return NextResponse.json(
      { status: false, message: 'Serve failed' },
      { status: 500 }
    );
  }
}
