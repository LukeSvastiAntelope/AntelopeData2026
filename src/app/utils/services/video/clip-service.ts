/**
 * Clip orchestration: submit → poll → ranked shorts.
 */

import { randomUUID } from 'crypto';
import {
  getClipProvider,
  getDefaultClipProviderId,
  type VideoClipProviderId,
  type VideoClipSubmitOptions,
} from '@/app/utils/services/video/clippers';
import { toAbsoluteAssetUrl } from '@/app/utils/services/video/asset-library';
import {
  loadClipJob,
  saveClipJob,
  type StoredClipJob,
} from '@/app/utils/services/video/clip-job-store';

export async function startClipJob(params: {
  userId: number;
  sourceUrl: string;
  provider?: VideoClipProviderId | string | null;
  language?: string;
  maxClips?: number;
  maxDurationSeconds?: number;
  topicKeywords?: string[];
}): Promise<StoredClipJob> {
  const source = String(params.sourceUrl || '').trim();
  if (!source) throw new Error('sourceUrl is required');

  const providerId = (params.provider ||
    getDefaultClipProviderId()) as VideoClipProviderId;
  const provider = getClipProvider(providerId);
  const appBase =
    process.env.NEXT_PUBLIC_APP_URL || process.env.AUTH_URL || undefined;
  const absoluteSource = toAbsoluteAssetUrl(source, appBase);

  const opts: VideoClipSubmitOptions = {
    language: params.language || 'en',
    maxClips: params.maxClips || 5,
    maxDurationSeconds: params.maxDurationSeconds || 30,
    topicKeywords: params.topicKeywords,
  };

  const handle = await provider.submit(absoluteSource, opts);
  const jobId = `cj_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const now = new Date().toISOString();
  const job: StoredClipJob = {
    jobId,
    providerJobId: handle.jobId,
    provider: providerId,
    userId: params.userId,
    sourceUrl: source,
    status: 'queued',
    progress: 5,
    clips: [],
    createdAt: now,
    updatedAt: now,
  };
  saveClipJob(job);
  return job;
}

export async function refreshClipJob(jobId: string): Promise<StoredClipJob> {
  const job = loadClipJob(jobId);
  if (!job) throw new Error('Clip job not found');
  if (job.status === 'succeeded' || job.status === 'failed' || job.status === 'canceled') {
    return job;
  }

  const provider = getClipProvider(job.provider);
  const state = await provider.status(job.providerJobId);
  job.status = state.status;
  job.progress = state.progress ?? job.progress;
  job.error = state.error || null;
  job.updatedAt = new Date().toISOString();

  if (state.status === 'succeeded') {
    try {
      job.clips = await provider.clips(job.providerJobId, {
        maxClips: 12,
      });
    } catch (error) {
      job.status = 'failed';
      job.error =
        error instanceof Error ? error.message : 'Failed to fetch clips';
    }
  }

  saveClipJob(job);
  return job;
}

export async function clipUntilDone(params: {
  userId: number;
  sourceUrl: string;
  provider?: VideoClipProviderId | string | null;
  language?: string;
  maxClips?: number;
  timeoutMs?: number;
}): Promise<StoredClipJob> {
  const job = await startClipJob(params);
  const timeout = params.timeoutMs ?? 15 * 60_000;
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const refreshed = await refreshClipJob(job.jobId);
    if (refreshed.status === 'succeeded') return refreshed;
    if (refreshed.status === 'failed' || refreshed.status === 'canceled') {
      throw new Error(refreshed.error || `Clip job ${refreshed.status}`);
    }
    await new Promise((r) => setTimeout(r, 2500));
  }
  throw new Error('Clip job timed out');
}
