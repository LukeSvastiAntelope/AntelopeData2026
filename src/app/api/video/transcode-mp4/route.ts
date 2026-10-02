import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { auth } from '@/auth';
import { requireUserId } from '@/app/utils/auth/require-user';
import {
  buildMediaKey,
  getStorageProvider,
  mediaMonthFolder,
  mediaObjectUrl,
  sanitizeStorageUserId,
} from '@/app/utils/services/storage';

/**
 * POST /api/video/transcode-mp4
 * Convert an uploaded WebM (or other) blob to H.264/AAC MP4 for Reels/LinkedIn.
 * Requires ffmpeg on the host (available in Cloud Agent / self-hosted; may be
 * absent on slim serverless images — client prefers native MP4 MediaRecorder).
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    let userId = session?.user?.id ? Number(session.user.id) : NaN;
    if (!Number.isFinite(userId)) {
      const authResult = requireUserId(req);
      userId = typeof authResult === 'string' ? Number(authResult) : NaN;
    }
    if (!Number.isFinite(userId) || userId <= 0) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json(
        { error: 'Expected multipart/form-data with file' },
        { status: 400 }
      );
    }

    const form = await req.formData();
    const file = form.get('file') as unknown as File | null;
    if (!file) {
      return NextResponse.json({ error: 'Missing file' }, { status: 400 });
    }

    const mime = file.type || '';
    if (
      !mime.startsWith('video/') &&
      !String(file.name || '').match(/\.(webm|mp4|mov)$/i)
    ) {
      return NextResponse.json(
        { error: 'Unsupported media type' },
        { status: 415 }
      );
    }

    // Already MP4 — just store
    if (mime === 'video/mp4' || String(file.name || '').endsWith('.mp4')) {
      const buf = Buffer.from(await file.arrayBuffer());
      const safeUserId = sanitizeStorageUserId(userId) || 'anon';
      const filename = `explainer_${Date.now()}_${randomUUID().slice(0, 8)}.mp4`;
      const key = buildMediaKey({
        userId: safeUserId,
        folder: mediaMonthFolder(),
        filename,
      });
      await getStorageProvider().put(key, buf, 'video/mp4');
      return NextResponse.json({
        status: true,
        url: mediaObjectUrl(key),
        key,
        converted: false,
      });
    }

    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'antelope-tx-'));
    const inPath = path.join(tmpRoot, 'input.webm');
    const outPath = path.join(tmpRoot, 'output.mp4');
    try {
      await fs.writeFile(inPath, Buffer.from(await file.arrayBuffer()));

      await new Promise<void>((resolve, reject) => {
        const ff = spawn(
          'ffmpeg',
          [
            '-y',
            '-i',
            inPath,
            '-c:v',
            'libx264',
            '-preset',
            'veryfast',
            '-pix_fmt',
            'yuv420p',
            '-c:a',
            'aac',
            '-b:a',
            '128k',
            '-movflags',
            '+faststart',
            outPath,
          ],
          { stdio: ['ignore', 'pipe', 'pipe'] }
        );
        let stderr = '';
        ff.stderr?.on('data', (d) => {
          stderr += String(d);
        });
        ff.on('error', (err) => {
          reject(
            new Error(
              `ffmpeg unavailable: ${err.message}. Record MP4 in-browser or install ffmpeg.`
            )
          );
        });
        ff.on('close', (code) => {
          if (code === 0) resolve();
          else
            reject(
              new Error(
                `ffmpeg failed (code ${code}): ${stderr.slice(-400) || 'unknown'}`
              )
            );
        });
      });

      const outBuf = await fs.readFile(outPath);
      const safeUserId = sanitizeStorageUserId(userId) || 'anon';
      const filename = `explainer_${Date.now()}_${randomUUID().slice(0, 8)}.mp4`;
      const key = buildMediaKey({
        userId: safeUserId,
        folder: mediaMonthFolder(),
        filename,
      });
      await getStorageProvider().put(key, outBuf, 'video/mp4');
      return NextResponse.json({
        status: true,
        url: mediaObjectUrl(key),
        key,
        converted: true,
      });
    } finally {
      try {
        await fs.rm(tmpRoot, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  } catch (error) {
    console.error('[video/transcode-mp4]', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Transcode to MP4 failed',
      },
      { status: 500 }
    );
  }
}
