import { randomUUID } from 'crypto';
import type {
  VideoGenOptions,
  VideoGenProvider,
  VideoGenRequest,
  VideoJobHandle,
  VideoJobState,
  VideoProviderCapabilities,
} from './types';

/**
 * Local mock provider — keeps the studio usable without FAL_KEY / API keys.
 * Simulates async generation and returns a public sample MP4 URL.
 */
const MOCK_JOBS = new Map<string, VideoJobState & { createdAt: number }>();

const SAMPLE_MP4 =
  'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4';

export const mockVideoProvider: VideoGenProvider = {
  id: 'mock',
  capabilities(): VideoProviderCapabilities {
    return {
      id: 'mock',
      displayName: 'Mock (dev)',
      tier: 'mock',
      modes: ['t2v', 'i2v', 'v2v'],
      referenceTransport: ['url', 'base64'],
      maxDurationSeconds: 30,
      notes: 'No GPU / API key required. Returns a sample clip after a short delay.',
    };
  },
  async generate(request: VideoGenRequest): Promise<VideoJobHandle> {
    const jobId = `mock_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    MOCK_JOBS.set(jobId, {
      jobId,
      provider: 'mock',
      status: 'queued',
      progress: 0,
      createdAt: Date.now(),
      raw: { prompt: request.prompt, mode: request.mode },
    });
    return { jobId, provider: 'mock' };
  },
  async status(jobId: string): Promise<VideoJobState> {
    const job = MOCK_JOBS.get(jobId);
    if (!job) {
      return {
        jobId,
        provider: 'mock',
        status: 'failed',
        error: 'Unknown mock job',
      };
    }
    const elapsed = Date.now() - job.createdAt;
    if (elapsed < 1500) {
      job.status = 'queued';
      job.progress = 10;
    } else if (elapsed < 4000) {
      job.status = 'running';
      job.progress = Math.min(90, 20 + Math.floor(elapsed / 50));
    } else {
      job.status = 'succeeded';
      job.progress = 100;
      job.assetUrl = SAMPLE_MP4;
    }
    MOCK_JOBS.set(jobId, job);
    return {
      jobId: job.jobId,
      provider: 'mock',
      status: job.status,
      progress: job.progress,
      assetUrl: job.assetUrl,
      error: job.error,
      raw: job.raw,
    };
  },
  async result(jobId: string, opts?: VideoGenOptions) {
    const timeout = opts?.timeoutMs ?? 60_000;
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const state = await this.status(jobId, opts);
      if (state.status === 'succeeded' && state.assetUrl) {
        return { assetUrl: state.assetUrl, state };
      }
      if (state.status === 'failed' || state.status === 'canceled') {
        throw new Error(state.error || `Mock job ${state.status}`);
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error('Mock video generation timed out');
  },
};
