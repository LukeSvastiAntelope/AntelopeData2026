/**
 * Mock clipper — studio works without Opus/Klap keys.
 *
 * Timing is encoded in the provider job id so status/clips survive
 * Next.js HMR / module isolation.
 */

import { randomUUID } from 'crypto';
import type {
  VideoClipCandidate,
  VideoClipProvider,
  VideoClipProviderCapabilities,
  VideoClipSubmitOptions,
} from './types';

const SAMPLE_CLIPS = [
  {
    url: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    hook: 'Opening punch — clear stakes in the first three seconds',
    score: 92,
  },
  {
    url: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
    hook: 'Policy beat with a memorable one-liner',
    score: 84,
  },
  {
    url: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
    hook: 'Crowd energy / GOTV call to action',
    score: 77,
  },
];

function parseCreatedAt(jobId: string): number | null {
  const m = /^mockclip_(\d{10,16})_/.exec(jobId);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export const mockClipProvider: VideoClipProvider = {
  id: 'mock',
  capabilities(): VideoClipProviderCapabilities {
    return {
      id: 'mock',
      displayName: 'Mock clipper (dev)',
      tier: 'mock',
      notes: 'No API key required. Returns ranked sample shorts after a short delay.',
    };
  },
  async submit(sourceUrl: string) {
    const createdAt = Date.now();
    const jobId = `mockclip_${createdAt}_${randomUUID().replace(/-/g, '').slice(0, 8)}`;
    return { jobId, raw: { sourceUrl, createdAt } };
  },
  async status(jobId: string) {
    const createdAt = parseCreatedAt(jobId);
    if (!createdAt) {
      return { jobId, status: 'failed', error: 'Unknown mock clip job' };
    }
    const elapsed = Date.now() - createdAt;
    if (elapsed < 2000) return { jobId, status: 'queued', progress: 15 };
    if (elapsed < 5000) return { jobId, status: 'running', progress: 55 };
    return { jobId, status: 'succeeded', progress: 100 };
  },
  async clips(jobId: string, _opts?: VideoClipSubmitOptions) {
    const createdAt = parseCreatedAt(jobId);
    if (!createdAt) throw new Error('Unknown mock clip job');
    const state = await this.status(jobId);
    if (state.status !== 'succeeded') {
      throw new Error('Clips not ready yet');
    }
    return SAMPLE_CLIPS.map((c, i) => ({
      id: `${jobId}_${i}`,
      url: c.url,
      score: c.score,
      hook: c.hook,
      durationSeconds: 15 + i * 5,
      captions: true,
    })) as VideoClipCandidate[];
  },
};
