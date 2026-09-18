/**
 * Higgsfield — optional cinematic tier (proprietary).
 * Env: HIGGSFIELD_API_KEY, optional HIGGSFIELD_API_BASE
 */

import { randomUUID } from 'crypto';
import type {
  VideoGenOptions,
  VideoGenProvider,
  VideoGenRequest,
  VideoJobHandle,
  VideoJobState,
  VideoProviderCapabilities,
} from './types';

const JOBS = new Map<string, VideoJobState & { request: VideoGenRequest }>();

function apiKey(): string | null {
  return process.env.HIGGSFIELD_API_KEY || null;
}

function apiBase(opts?: VideoGenOptions): string {
  return (
    opts?.endpointBase ||
    process.env.HIGGSFIELD_API_BASE ||
    'https://api.higgsfield.ai'
  ).replace(/\/$/, '');
}

export const higgsfieldVideoProvider: VideoGenProvider = {
  id: 'higgsfield',
  capabilities(): VideoProviderCapabilities {
    return {
      id: 'higgsfield',
      displayName: 'Higgsfield (cinematic)',
      tier: 'cinematic',
      modes: ['t2v', 'i2v'],
      referenceTransport: ['url'],
      maxDurationSeconds: 10,
      notes: apiKey()
        ? 'Configured via HIGGSFIELD_API_KEY.'
        : 'Set HIGGSFIELD_API_KEY to enable. Proprietary cinematic tier.',
    };
  },
  async generate(
    request: VideoGenRequest,
    opts?: VideoGenOptions
  ): Promise<VideoJobHandle> {
    const key = apiKey();
    if (!key) {
      throw new Error('HIGGSFIELD_API_KEY is not configured');
    }
    if (request.mode === 'v2v') {
      throw new Error('Higgsfield provider does not declare v2v support');
    }
    if (request.mode === 'i2v' && !request.referenceImage) {
      throw new Error('i2v requires referenceImage');
    }

    // Best-effort HTTP shape — endpoints vary; override via HIGGSFIELD_API_BASE.
    try {
      const res = await fetch(`${apiBase(opts)}/v1/videos/generate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: request.prompt,
          mode: request.mode,
          image_url: request.referenceImage || undefined,
          aspect_ratio: request.aspectRatio || '9:16',
          model: opts?.model || 'higgsfield-standard',
        }),
        signal: opts?.signal,
      });
      if (res.ok) {
        const data = (await res.json()) as { id?: string; job_id?: string };
        const id = data.id || data.job_id || randomUUID();
        const jobId = `higgs_${id}`;
        JOBS.set(jobId, {
          jobId,
          provider: 'higgsfield',
          status: 'queued',
          progress: 5,
          request,
          raw: data,
        });
        return { jobId, provider: 'higgsfield' };
      }
    } catch {
      /* fall through to local queued stub that will surface API errors on poll */
    }

    const jobId = `higgs_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    JOBS.set(jobId, {
      jobId,
      provider: 'higgsfield',
      status: 'failed',
      error:
        'Higgsfield API did not accept the request. Check HIGGSFIELD_API_KEY / HIGGSFIELD_API_BASE.',
      request,
    });
    return { jobId, provider: 'higgsfield' };
  },
  async status(jobId: string, opts?: VideoGenOptions): Promise<VideoJobState> {
    const cached = JOBS.get(jobId);
    if (cached?.status === 'failed') {
      return {
        jobId,
        provider: 'higgsfield',
        status: 'failed',
        error: cached.error,
      };
    }
    const key = apiKey();
    if (!key) {
      return {
        jobId,
        provider: 'higgsfield',
        status: 'failed',
        error: 'HIGGSFIELD_API_KEY missing',
      };
    }
    const remoteId = jobId.replace(/^higgs_/, '');
    try {
      const res = await fetch(`${apiBase(opts)}/v1/videos/${remoteId}`, {
        headers: { Authorization: `Bearer ${key}` },
        signal: opts?.signal,
      });
      if (!res.ok) {
        return {
          jobId,
          provider: 'higgsfield',
          status: 'failed',
          error: `Higgsfield status ${res.status}`,
        };
      }
      const data = (await res.json()) as any;
      const statusRaw = String(data.status || '').toLowerCase();
      const status =
        statusRaw === 'completed' || statusRaw === 'succeeded'
          ? 'succeeded'
          : statusRaw === 'failed'
            ? 'failed'
            : statusRaw === 'queued'
              ? 'queued'
              : 'running';
      return {
        jobId,
        provider: 'higgsfield',
        status,
        progress: status === 'succeeded' ? 100 : 50,
        assetUrl: data.video_url || data.url || null,
        error: data.error || null,
        raw: data,
      };
    } catch (error) {
      return {
        jobId,
        provider: 'higgsfield',
        status: 'failed',
        error: error instanceof Error ? error.message : 'Higgsfield poll failed',
      };
    }
  },
  async result(jobId: string, opts?: VideoGenOptions) {
    const timeout = opts?.timeoutMs ?? 10 * 60_000;
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const state = await this.status(jobId, opts);
      if (state.status === 'succeeded' && state.assetUrl) {
        return { assetUrl: state.assetUrl, state };
      }
      if (state.status === 'failed' || state.status === 'canceled') {
        throw new Error(state.error || `Higgsfield job ${state.status}`);
      }
      await new Promise((r) => setTimeout(r, 2500));
    }
    throw new Error('Higgsfield video generation timed out');
  },
};
