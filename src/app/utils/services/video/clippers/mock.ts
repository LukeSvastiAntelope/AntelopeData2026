/**
 * Mock clipper — studio works without Opus/Klap keys.
 */

import { randomUUID } from 'crypto';
import type {
  VideoClipCandidate,
  VideoClipProvider,
  VideoClipProviderCapabilities,
  VideoClipSubmitOptions,
} from './types';

type MockJob = {
  createdAt: number;
  sourceUrl: string;
  clips?: VideoClipCandidate[];
};

const JOBS = new Map<string, MockJob>();

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
    const jobId = `mockclip_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    JOBS.set(jobId, { createdAt: Date.now(), sourceUrl });
    return { jobId };
  },
  async status(jobId: string) {
    const job = JOBS.get(jobId);
    if (!job) {
      return { jobId, status: 'failed', error: 'Unknown mock clip job' };
    }
    const elapsed = Date.now() - job.createdAt;
    if (elapsed < 2000) return { jobId, status: 'queued', progress: 15 };
    if (elapsed < 5000) return { jobId, status: 'running', progress: 55 };
    return { jobId, status: 'succeeded', progress: 100 };
  },
  async clips(jobId: string, _opts?: VideoClipSubmitOptions) {
    const job = JOBS.get(jobId);
    if (!job) throw new Error('Unknown mock clip job');
    const state = await this.status(jobId);
    if (state.status !== 'succeeded') {
      throw new Error('Clips not ready yet');
    }
    if (!job.clips) {
      job.clips = SAMPLE_CLIPS.map((c, i) => ({
        id: `${jobId}_${i}`,
        url: c.url,
        score: c.score,
        hook: c.hook,
        durationSeconds: 15 + i * 5,
        captions: true,
      }));
      JOBS.set(jobId, job);
    }
    return job.clips;
  },
};
