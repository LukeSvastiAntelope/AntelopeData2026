/**
 * Client-side explainer assembly: hook clip → real chart card → CTA.
 * Chart numbers stay pixel-perfect (never sent to i2v).
 * Prefers MP4 MediaRecorder (Safari); converts WebM→MP4 before staging.
 */

export type VideoAspect = '9:16' | '16:9' | '1:1';

export function aspectPixelSize(aspect: VideoAspect): { width: number; height: number } {
  switch (aspect) {
    case '16:9':
      return { width: 1280, height: 720 };
    case '1:1':
      return { width: 1080, height: 1080 };
    case '9:16':
    default:
      return { width: 720, height: 1280 };
  }
}

export type RecorderMime = { mimeType: string; container: 'mp4' | 'webm' };

/** Prefer MP4 (Safari records MP4 only; Reels/LinkedIn reject WebM). */
export function pickRecorderMime(): RecorderMime {
  const mp4Candidates = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=avc1.4D401E,mp4a.40.2',
    'video/mp4;codecs=avc1,mp4a.40.2',
    'video/mp4',
  ];
  const webmCandidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  for (const c of mp4Candidates) {
    if (
      typeof MediaRecorder !== 'undefined' &&
      MediaRecorder.isTypeSupported(c)
    ) {
      return { mimeType: c, container: 'mp4' };
    }
  }
  for (const c of webmCandidates) {
    if (
      typeof MediaRecorder !== 'undefined' &&
      MediaRecorder.isTypeSupported(c)
    ) {
      return { mimeType: c, container: 'webm' };
    }
  }
  return { mimeType: 'video/webm', container: 'webm' };
}

/**
 * Prefer local /api/media URL; otherwise proxy remote fal.ai etc. so canvas
 * recording never hits cross-origin taint errors.
 */
export function resolvePlayableMediaUrl(
  url: string | null | undefined,
  localAssetUrl?: string | null
): string {
  const local = (localAssetUrl || '').trim();
  if (local) return local;
  const raw = (url || '').trim();
  if (!raw) throw new Error('Missing media URL');
  if (
    raw.startsWith('/api/media/') ||
    raw.startsWith('/api/image-proxy') ||
    raw.startsWith('data:') ||
    raw.startsWith('blob:')
  ) {
    return raw;
  }
  // Same-origin relative paths are fine
  if (raw.startsWith('/') && !raw.startsWith('//')) {
    return raw;
  }
  // Absolute same-origin
  try {
    if (typeof window !== 'undefined') {
      const u = new URL(raw, window.location.origin);
      if (u.origin === window.location.origin) return u.pathname + u.search;
    }
  } catch {
    /* fall through to proxy */
  }
  return `/api/image-proxy?url=${encodeURIComponent(raw)}`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load chart image'));
    img.src = src;
  });
}

function loadVideo(src: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.onloadeddata = () => resolve(video);
    video.onerror = () => reject(new Error('Failed to load video segment'));
    video.src = resolvePlayableMediaUrl(src);
  });
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const trial = current ? `${current} ${word}` : word;
    if (ctx.measureText(trial).width <= maxWidth) {
      current = trial;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [];
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sw: number,
  sh: number,
  dw: number,
  dh: number,
  scale = 1,
  cx = 0.5,
  cy = 0.5
) {
  const base = Math.max(dw / sw, dh / sh) * scale;
  const tw = sw * base;
  const th = sh * base;
  const dx = (dw - tw) * cx;
  const dy = (dh - th) * cy;
  ctx.drawImage(source, dx, dy, tw, th);
}

function drawCaptionBar(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  caption: string,
  caveat?: string | null
) {
  const pad = Math.round(width * 0.05);
  const barH = Math.round(height * 0.28);
  const y0 = height - barH;
  const grad = ctx.createLinearGradient(0, y0, 0, height);
  grad.addColorStop(0, 'rgba(11, 61, 46, 0)');
  grad.addColorStop(0.25, 'rgba(11, 61, 46, 0.82)');
  grad.addColorStop(1, 'rgba(11, 61, 46, 0.95)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, y0, width, barH);

  ctx.fillStyle = '#F7F4EF';
  ctx.font = `600 ${Math.round(width * 0.045)}px "Source Sans 3", "Segoe UI", sans-serif`;
  const lines = wrapText(ctx, caption, width - pad * 2).slice(0, 4);
  let y = y0 + Math.round(barH * 0.28);
  for (const line of lines) {
    ctx.fillText(line, pad, y);
    y += Math.round(width * 0.055);
  }
  if (caveat?.trim()) {
    ctx.fillStyle = 'rgba(247, 244, 239, 0.85)';
    ctx.font = `400 ${Math.round(width * 0.028)}px "Source Sans 3", "Segoe UI", sans-serif`;
    const caveatLines = wrapText(ctx, caveat.trim(), width - pad * 2).slice(0, 3);
    for (const line of caveatLines) {
      ctx.fillText(line, pad, y);
      y += Math.round(width * 0.036);
    }
  }
  ctx.fillStyle = 'rgba(247, 244, 239, 0.55)';
  ctx.font = `500 ${Math.round(width * 0.022)}px "Source Sans 3", "Segoe UI", sans-serif`;
  ctx.fillText('Powered by Antelope · real survey chart', pad, height - pad * 0.6);
}

function drawCtaCard(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  title: string,
  body?: string
) {
  ctx.fillStyle = '#0B3D2E';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#F7F4EF';
  ctx.font = `700 ${Math.round(width * 0.07)}px "Source Serif 4", Georgia, serif`;
  const pad = Math.round(width * 0.08);
  const titleLines = wrapText(ctx, title, width - pad * 2).slice(0, 4);
  let y = height * 0.38;
  for (const line of titleLines) {
    ctx.fillText(line, pad, y);
    y += Math.round(width * 0.085);
  }
  if (body?.trim()) {
    ctx.font = `400 ${Math.round(width * 0.038)}px "Source Sans 3", "Segoe UI", sans-serif`;
    ctx.fillStyle = 'rgba(247, 244, 239, 0.85)';
    for (const line of wrapText(ctx, body.trim(), width - pad * 2).slice(0, 4)) {
      ctx.fillText(line, pad, y + 12);
      y += Math.round(width * 0.048);
    }
  }
}

async function attachOptionalAudio(
  videoStream: MediaStream,
  audioUrl?: string | null
): Promise<{ stream: MediaStream; cleanup: () => void }> {
  if (!audioUrl?.trim()) {
    return { stream: videoStream, cleanup: () => undefined };
  }
  try {
    const audio = document.createElement('audio');
    audio.crossOrigin = 'anonymous';
    audio.preload = 'auto';
    audio.src = resolvePlayableMediaUrl(audioUrl);
    audio.loop = true;
    await new Promise<void>((resolve, reject) => {
      audio.oncanplaythrough = () => resolve();
      audio.onerror = () => reject(new Error('Failed to load audio track'));
      // Safari sometimes skips canplaythrough
      setTimeout(() => resolve(), 2500);
    });
    const capture =
      // @ts-expect-error captureStream exists in Chromium / Safari
      typeof audio.captureStream === 'function'
        ? // @ts-expect-error captureStream
          (audio.captureStream() as MediaStream)
        : // @ts-expect-error mozCaptureStream
          typeof audio.mozCaptureStream === 'function'
          ? // @ts-expect-error mozCaptureStream
            (audio.mozCaptureStream() as MediaStream)
          : null;
    if (!capture?.getAudioTracks?.().length) {
      return { stream: videoStream, cleanup: () => undefined };
    }
    await audio.play().catch(() => undefined);
    const mixed = new MediaStream([
      ...videoStream.getVideoTracks(),
      ...capture.getAudioTracks(),
    ]);
    return {
      stream: mixed,
      cleanup: () => {
        try {
          audio.pause();
          audio.src = '';
        } catch {
          /* ignore */
        }
        for (const t of capture.getTracks()) t.stop();
      },
    };
  } catch (e) {
    console.warn('[assemble] optional audio track skipped', e);
    return { stream: videoStream, cleanup: () => undefined };
  }
}

async function recordCanvas(
  drawFrame: (t: number, ctx: CanvasRenderingContext2D) => boolean | void,
  opts: {
    width: number;
    height: number;
    durationMs: number;
    fps?: number;
    audioUrl?: string | null;
  }
): Promise<Blob> {
  const { width, height, durationMs } = opts;
  const fps = opts.fps ?? 30;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');

  const videoStream = canvas.captureStream(fps);
  const { stream, cleanup } = await attachOptionalAudio(
    videoStream,
    opts.audioUrl
  );
  const picked = pickRecorderMime();
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, {
      mimeType: picked.mimeType,
      videoBitsPerSecond: 4_000_000,
    });
  } catch {
    // Safari sometimes rejects codec string — retry bare type
    recorder = new MediaRecorder(stream, {
      mimeType: picked.container === 'mp4' ? 'video/mp4' : 'video/webm',
      videoBitsPerSecond: 4_000_000,
    });
  }
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };

  const done = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => {
      cleanup();
      const type =
        recorder.mimeType?.split(';')[0] ||
        (picked.container === 'mp4' ? 'video/mp4' : 'video/webm');
      resolve(new Blob(chunks, { type }));
    };
    recorder.onerror = () => {
      cleanup();
      reject(new Error('MediaRecorder failed'));
    };
  });

  recorder.start(100);
  const start = performance.now();
  await new Promise<void>((resolve) => {
    const tick = () => {
      const elapsed = performance.now() - start;
      const t = Math.min(1, elapsed / durationMs);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, width, height);
      const stopEarly = drawFrame(t, ctx) === false;
      if (elapsed >= durationMs || stopEarly) {
        setTimeout(() => {
          try {
            recorder.stop();
          } catch {
            /* already stopped */
          }
          resolve();
        }, 80);
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  return done;
}

/** Static / gentle-zoom chart card with burned-in caption (3–5s). */
export async function renderChartCardClip(opts: {
  chartUrl: string;
  caption: string;
  caveat?: string | null;
  durationMs?: number;
  width: number;
  height: number;
  zoom?: 'in' | 'none';
  audioUrl?: string | null;
}): Promise<Blob> {
  const durationMs = Math.min(5000, Math.max(3000, opts.durationMs ?? 4000));
  const img = await loadImage(resolvePlayableMediaUrl(opts.chartUrl));
  const zoom = opts.zoom ?? 'in';

  return recordCanvas(
    (t, ctx) => {
      const scale = zoom === 'in' ? 1 + t * 0.08 : 1;
      drawCover(
        ctx,
        img,
        img.naturalWidth || img.width,
        img.naturalHeight || img.height,
        opts.width,
        opts.height,
        scale,
        0.5,
        0.45
      );
      drawCaptionBar(ctx, opts.width, opts.height, opts.caption, opts.caveat);
    },
    {
      width: opts.width,
      height: opts.height,
      durationMs,
      audioUrl: opts.audioUrl,
    }
  );
}

/** Plain CTA end-card when no generative CTA clip is available. */
export async function renderCtaCardClip(opts: {
  title: string;
  body?: string;
  durationMs?: number;
  width: number;
  height: number;
  audioUrl?: string | null;
}): Promise<Blob> {
  const durationMs = Math.min(4000, Math.max(2000, opts.durationMs ?? 3000));
  return recordCanvas(
    (_t, ctx) => {
      drawCtaCard(ctx, opts.width, opts.height, opts.title, opts.body);
    },
    {
      width: opts.width,
      height: opts.height,
      durationMs,
      audioUrl: opts.audioUrl,
    }
  );
}

async function playVideoOntoCanvas(
  video: HTMLVideoElement,
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): Promise<number> {
  await video.play().catch(() => undefined);
  const durationMs = Math.max(500, (video.duration || 4) * 1000);
  const start = performance.now();
  await new Promise<void>((resolve) => {
    const tick = () => {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, width, height);
      drawCover(
        ctx,
        video,
        video.videoWidth || width,
        video.videoHeight || height,
        width,
        height,
        1
      );
      if (video.ended || performance.now() - start >= durationMs + 200) {
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  try {
    video.pause();
  } catch {
    /* ignore */
  }
  return durationMs;
}

export type ExplainerSegment =
  | { kind: 'video'; url: string; localAssetUrl?: string | null }
  | {
      kind: 'chart';
      chartUrl: string;
      caption: string;
      caveat?: string | null;
      durationMs?: number;
    }
  | { kind: 'cta_card'; title: string; body?: string; durationMs?: number };

/**
 * Assemble hook → real chart → CTA into one MP4 (or WebM→MP4) via canvas + MediaRecorder.
 */
export async function assembleExplainerVideo(opts: {
  segments: ExplainerSegment[];
  width: number;
  height: number;
  onProgress?: (label: string, pct: number) => void;
  /** Optional music / voiceover under the explainer (looped for duration). */
  audioUrl?: string | null;
}): Promise<Blob> {
  const { width, height, segments, onProgress, audioUrl } = opts;
  if (!segments.length) throw new Error('No segments to assemble');

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');

  const videoStream = canvas.captureStream(30);
  const { stream, cleanup } = await attachOptionalAudio(videoStream, audioUrl);
  const picked = pickRecorderMime();
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, {
      mimeType: picked.mimeType,
      videoBitsPerSecond: 5_000_000,
    });
  } catch {
    recorder = new MediaRecorder(stream, {
      mimeType: picked.container === 'mp4' ? 'video/mp4' : 'video/webm',
      videoBitsPerSecond: 5_000_000,
    });
  }
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };

  const done = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => {
      cleanup();
      const type =
        recorder.mimeType?.split(';')[0] ||
        (picked.container === 'mp4' ? 'video/mp4' : 'video/webm');
      resolve(new Blob(chunks, { type }));
    };
    recorder.onerror = () => {
      cleanup();
      reject(new Error('Assembly MediaRecorder failed'));
    };
  });

  recorder.start(200);
  onProgress?.('Assembling explainer…', 5);

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const pct = Math.round(((i + 0.2) / segments.length) * 90);
    if (seg.kind === 'video') {
      onProgress?.(`Playing segment ${i + 1}…`, pct);
      const playUrl = resolvePlayableMediaUrl(seg.url, seg.localAssetUrl);
      const video = await loadVideo(playUrl);
      await playVideoOntoCanvas(video, ctx, width, height);
    } else if (seg.kind === 'chart') {
      onProgress?.('Inserting real chart card…', pct);
      const img = await loadImage(resolvePlayableMediaUrl(seg.chartUrl));
      const durationMs = Math.min(5000, Math.max(3000, seg.durationMs ?? 4000));
      const start = performance.now();
      await new Promise<void>((resolve) => {
        const tick = () => {
          const t = Math.min(1, (performance.now() - start) / durationMs);
          ctx.fillStyle = '#111';
          ctx.fillRect(0, 0, width, height);
          drawCover(
            ctx,
            img,
            img.naturalWidth || img.width,
            img.naturalHeight || img.height,
            width,
            height,
            1 + t * 0.08,
            0.5,
            0.45
          );
          drawCaptionBar(ctx, width, height, seg.caption, seg.caveat);
          if (t >= 1) {
            resolve();
            return;
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    } else {
      onProgress?.('CTA card…', pct);
      const durationMs = Math.min(4000, Math.max(2000, seg.durationMs ?? 3000));
      const start = performance.now();
      await new Promise<void>((resolve) => {
        const tick = () => {
          drawCtaCard(ctx, width, height, seg.title, seg.body);
          if (performance.now() - start >= durationMs) {
            resolve();
            return;
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    }
  }

  onProgress?.('Finalizing…', 95);
  await new Promise((r) => setTimeout(r, 120));
  try {
    recorder.stop();
  } catch {
    /* ignore */
  }
  const blob = await done;
  onProgress?.('Done', 100);
  return blob;
}

/** Upload assembled video; WebM is transcoded to MP4 server-side when needed. */
export async function uploadAssembledVideo(
  blob: Blob,
  filename = 'explainer.mp4'
) {
  const isMp4 =
    blob.type.includes('mp4') || filename.toLowerCase().endsWith('.mp4');
  const formName = isMp4
    ? filename.endsWith('.mp4')
      ? filename
      : `${filename.replace(/\.[^.]+$/, '')}.mp4`
    : filename.endsWith('.webm')
      ? filename
      : `${filename.replace(/\.[^.]+$/, '')}.webm`;

  // Prefer transcode endpoint so Zapier/Reels/LinkedIn always get H.264 MP4
  if (!isMp4) {
    const fd = new FormData();
    fd.append('file', blob, formName);
    const tx = await fetch('/api/video/transcode-mp4', {
      method: 'POST',
      body: fd,
    });
    const txData = await tx.json().catch(() => ({}));
    if (tx.ok && txData.status && txData.url) {
      return {
        url: String(txData.url),
        storageKey: txData.key ? String(txData.key) : null,
        container: 'mp4' as const,
      };
    }
    console.warn(
      '[assemble] transcode-mp4 failed, uploading original',
      txData.error
    );
  } else {
    // Store MP4 via transcode route (pass-through) for consistent ownership keys
    const fd = new FormData();
    fd.append('file', blob, formName);
    const tx = await fetch('/api/video/transcode-mp4', {
      method: 'POST',
      body: fd,
    });
    const txData = await tx.json().catch(() => ({}));
    if (tx.ok && txData.status && txData.url) {
      return {
        url: String(txData.url),
        storageKey: txData.key ? String(txData.key) : null,
        container: 'mp4' as const,
      };
    }
  }

  const fd = new FormData();
  fd.append('file', blob, formName);
  const res = await fetch('/api/media/upload', { method: 'POST', body: fd });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.status) {
    throw new Error(data.message || data.error || 'Failed to upload assembled video');
  }
  return {
    url: String(data.url),
    storageKey: data.key ? String(data.key) : null,
    container: (isMp4 ? 'mp4' : 'webm') as 'mp4' | 'webm',
  };
}
