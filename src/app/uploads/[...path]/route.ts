/**
 * GET /uploads/[...path] — compat for legacy /uploads/... links.
 *
 * Same auth + ownership + traversal guards as /api/media; streams from the
 * private StorageProvider root. Chosen over DB URL rewrites so old references
 * keep working but are no longer world-readable.
 *
 * Prefer /api/media/... for new code.
 */

import { NextRequest, NextResponse } from 'next/server';
import { serveOwnedMedia } from '@/app/utils/services/storage/serve-owned-media';

export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ path?: string[] }> }
) {
  try {
    const { path: pathSegments } = await context.params;
    return await serveOwnedMedia(req, pathSegments);
  } catch (err) {
    console.error('[uploads/compat]', err instanceof Error ? err.message : 'error');
    return NextResponse.json({ status: false, message: 'Serve failed' }, { status: 500 });
  }
}
