/**
 * GET /api/media/[...path]
 * Authenticated serve for private uploads.
 */

import { NextRequest } from 'next/server';
import {
  mediaKeyFromPathSegments,
  serveOwnedMedia,
} from '@/app/utils/services/storage/serve-owned-media';

export const runtime = 'nodejs';
export { mediaKeyFromPathSegments };

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ path?: string[] }> }
) {
  try {
    const { path: pathSegments } = await context.params;
    return await serveOwnedMedia(req, pathSegments);
  } catch (err) {
    console.error('[media/serve]', err instanceof Error ? err.message : 'error');
    const { NextResponse } = await import('next/server');
    return NextResponse.json({ status: false, message: 'Serve failed' }, { status: 500 });
  }
}
