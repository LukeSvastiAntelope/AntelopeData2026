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
 *
 * Job timing is encoded in the provider job id (`mock_<createdAtMs>_<nonce>`)
 * so status survives Next.js HMR / module isolation (in-memory Maps do not).
 */
const SAMPLE_MP4 =
  'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4';

function parseMockCreatedAt(jobId: string): number | null {
  const m = /^mock_(\d{10,16})_/.exec(jobId);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

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
    const createdAt = Date.now();
    const jobId = `mock_${createdAt}_${randomUUID().replace(/-/g, '').slice(0, 8)}`;
    return { jobId, provider: 'mock' };
  },
  async status(jobId: string): Promise<VideoJobState> {
    const createdAt = parseMockCreatedAt(jobId);
    if (!createdAt) {
      return {
        jobId,
        provider: 'mock',
        status: 'failed',
        error: 'Unknown mock job',
      };
    }
    const elapsed = Date.now() - createdAt;
    if (elapsed < 1500) {
      return {
        jobId,
        provider: 'mock',
        status: 'queued',
        progress: 10,
      };
    }
    if (elapsed < 4000) {
      return {
        jobId,
        provider: 'mock',
        status: 'running',
        progress: Math.min(90, 20 + Math.floor(elapsed / 50)),
      };
    }
    return {
      jobId,
      provider: 'mock',
      status: 'succeeded',
      progress: 100,
      assetUrl: SAMPLE_MP4,
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
