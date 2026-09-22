/**
 * Orchestrates provider generate → poll → optional local mirror via StorageProvider.
 */

import { randomUUID } from 'crypto';
import {
  getDefaultVideoProviderId,
  getVideoProvider,
  isModeSupported,
  type VideoAspectRatio,
  type VideoGenMode,
  type VideoProviderId,
} from '@/app/utils/services/video/providers';
import { toAbsoluteAssetUrl } from '@/app/utils/services/video/asset-library';
import {
  loadVideoJob,
  saveVideoJob,
  type StoredVideoJob,
} from '@/app/utils/services/video/job-store';
import {
  buildMediaKey,
  getStorageProvider,
  mediaMonthFolder,
  mediaObjectUrl,
  sanitizeStorageUserId,
} from '@/app/utils/services/storage';

async function mirrorRemoteVideo(
  remoteUrl: string,
  userId: number
): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    const res = await fetch(remoteUrl, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const safeUserId = sanitizeStorageUserId(userId) || 'anon';
    const filename = `video_${Date.now()}_${randomUUID().slice(0, 8)}.mp4`;
    const key = buildMediaKey({
      userId: safeUserId,
      folder: mediaMonthFolder(),
      filename,
    });
    await getStorageProvider().put(key, buf, 'video/mp4');
    return mediaObjectUrl(key);
  } catch (error) {
    console.warn('[video] mirror failed (non-fatal):', error);
    return null;
  }
}

export async function startVideoGeneration(params: {
  userId: number;
  prompt: string;
  modelPrompt?: string;
  provider?: VideoProviderId | string | null;
  mode: VideoGenMode;
  aspectRatio?: VideoAspectRatio;
  durationSeconds?: number;
  referenceImage?: string | null;
  referenceVideo?: string | null;
  negativePrompt?: string | null;
}): Promise<StoredVideoJob> {
  const providerId = (params.provider || getDefaultVideoProviderId()) as VideoProviderId;
  const provider = getVideoProvider(providerId);
  const caps = provider.capabilities();
  if (!isModeSupported(caps, params.mode)) {
    throw new Error(
      `Provider ${providerId} does not support mode ${params.mode}. Supported: ${caps.modes.join(', ')}`
    );
  }

  const modelPrompt = String(params.modelPrompt || params.prompt).trim();
  if (!modelPrompt) throw new Error('prompt is required');

  const appBase = process.env.NEXT_PUBLIC_APP_URL || process.env.AUTH_URL || undefined;
  const referenceImage = params.referenceImage
    ? toAbsoluteAssetUrl(params.referenceImage, appBase)
    : null;
  const referenceVideo = params.referenceVideo
    ? toAbsoluteAssetUrl(params.referenceVideo, appBase)
    : null;

  const handle = await provider.generate(
    {
      prompt: modelPrompt,
      mode: params.mode,
      aspectRatio: params.aspectRatio || '9:16',
      durationSeconds: params.durationSeconds || 5,
      referenceImage,
      referenceVideo,
      negativePrompt: params.negativePrompt,
    },
    {}
  );

  const jobId = `vj_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const now = new Date().toISOString();
  const job: StoredVideoJob = {
    jobId,
    providerJobId: handle.jobId,
    provider: handle.provider,
    userId: params.userId,
    status: 'queued',
    progress: 5,
    mode: params.mode,
    prompt: params.prompt,
    modelPrompt,
    aspectRatio: params.aspectRatio || '9:16',
    referenceImage: params.referenceImage || null,
    referenceVideo: params.referenceVideo || null,
    createdAt: now,
    updatedAt: now,
  };
  saveVideoJob(job);
  return job;
}

export async function refreshVideoJob(jobId: string): Promise<StoredVideoJob> {
  const job = loadVideoJob(jobId);
  if (!job) throw new Error('Job not found');
  if (job.status === 'succeeded' || job.status === 'failed' || job.status === 'canceled') {
    return job;
  }

  const provider = getVideoProvider(job.provider);
  let state = await provider.status(job.providerJobId);

  // Recover mock jobs whose in-memory map was lost (old ids) using stored createdAt.
  if (
    job.provider === 'mock' &&
    state.status === 'failed' &&
    String(state.error || '').includes('Unknown mock job')
  ) {
    const createdMs = Date.parse(job.createdAt);
    if (Number.isFinite(createdMs)) {
      const elapsed = Date.now() - createdMs;
      if (elapsed < 1500) {
        state = { ...state, status: 'queued', progress: 10, error: undefined };
      } else if (elapsed < 4000) {
        state = {
          ...state,
          status: 'running',
          progress: Math.min(90, 20 + Math.floor(elapsed / 50)),
          error: undefined,
        };
      } else {
        state = {
          ...state,
          status: 'succeeded',
          progress: 100,
          error: undefined,
          assetUrl:
            'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
        };
      }
    }
  }

  job.status = state.status;
  job.progress = state.progress ?? job.progress;
  job.error = state.error || null;
  job.updatedAt = new Date().toISOString();

  if (state.status === 'succeeded' && state.assetUrl) {
    job.assetUrl = state.assetUrl;
    const local = await mirrorRemoteVideo(state.assetUrl, job.userId);
    if (local) job.localAssetUrl = local;
  }

  saveVideoJob(job);
  return job;
}

/**
 * Blocking helper for tool execute path — poll until done or timeout.
 */
export async function generateVideoUntilDone(params: {
  userId: number;
  prompt: string;
  modelPrompt?: string;
  provider?: VideoProviderId | string | null;
  mode?: VideoGenMode;
  aspectRatio?: VideoAspectRatio;
  durationSeconds?: number;
  referenceImage?: string | null;
  referenceVideo?: string | null;
  timeoutMs?: number;
}): Promise<StoredVideoJob> {
  const job = await startVideoGeneration({
    ...params,
    mode: params.mode || 't2v',
  });
  const timeout = params.timeoutMs ?? 10 * 60_000;
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const refreshed = await refreshVideoJob(job.jobId);
    if (refreshed.status === 'succeeded') return refreshed;
    if (refreshed.status === 'failed' || refreshed.status === 'canceled') {
      throw new Error(refreshed.error || `Video job ${refreshed.status}`);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error('Video generation timed out');
}
