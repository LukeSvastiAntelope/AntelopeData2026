/**
 * V3 design-for: self-hosted Wan / ComfyUI endpoint.
 * Same VideoGenProvider interface — drop in by setting COMFYUI_API_BASE.
 * Not a full workflow builder; thin HTTP adapter ready for a local queue.
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

function apiBase(opts?: VideoGenOptions): string | null {
  const base = opts?.endpointBase || process.env.COMFYUI_API_BASE || '';
  return base ? base.replace(/\/$/, '') : null;
}

export const comfyuiVideoProvider: VideoGenProvider = {
  id: 'comfyui',
  capabilities(): VideoProviderCapabilities {
    return {
      id: 'comfyui',
      displayName: 'Self-hosted Wan / ComfyUI',
      tier: 'self_host',
      modes: ['t2v', 'i2v', 'v2v'],
      referenceTransport: ['url', 'base64'],
      maxDurationSeconds: 15,
      notes:
        'V3 path: point COMFYUI_API_BASE at your Wan/ComfyUI server. Same caller interface as fal Wan — no rewrite.',
    };
  },
  async generate(
    request: VideoGenRequest,
    opts?: VideoGenOptions
  ): Promise<VideoJobHandle> {
    const base = apiBase(opts);
    if (!base) {
      throw new Error(
        'COMFYUI_API_BASE is not configured (self-hosted Wan/ComfyUI)'
      );
    }
    const res = await fetch(`${base}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: request.prompt,
        mode: request.mode,
        image_url: request.referenceImage || undefined,
        video_url: request.referenceVideo || undefined,
        aspect_ratio: request.aspectRatio || '9:16',
        duration: request.durationSeconds || 5,
        model: opts?.model || 'wan-2.2',
      }),
      signal: opts?.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`ComfyUI submit failed (${res.status}): ${text.slice(0, 400)}`);
    }
    const data = (await res.json()) as { job_id?: string; id?: string };
    const id = data.job_id || data.id || randomUUID();
    return { jobId: `comfy_${id}`, provider: 'comfyui' };
  },
  async status(jobId: string, opts?: VideoGenOptions): Promise<VideoJobState> {
    const base = apiBase(opts);
    if (!base) {
      return {
        jobId,
        provider: 'comfyui',
        status: 'failed',
        error: 'COMFYUI_API_BASE missing',
      };
    }
    const remoteId = jobId.replace(/^comfy_/, '');
    const res = await fetch(`${base}/jobs/${remoteId}`, {
      signal: opts?.signal,
    });
    if (!res.ok) {
      return {
        jobId,
        provider: 'comfyui',
        status: 'failed',
        error: `ComfyUI status ${res.status}`,
      };
    }
    const data = (await res.json()) as any;
    const statusRaw = String(data.status || '').toLowerCase();
    const status =
      statusRaw === 'succeeded' || statusRaw === 'completed'
        ? 'succeeded'
        : statusRaw === 'failed'
          ? 'failed'
          : statusRaw === 'queued'
            ? 'queued'
            : 'running';
    return {
      jobId,
      provider: 'comfyui',
      status,
      progress: Number(data.progress) || (status === 'succeeded' ? 100 : 40),
      assetUrl: data.asset_url || data.url || null,
      error: data.error || null,
      raw: data,
    };
  },
  async result(jobId: string, opts?: VideoGenOptions) {
    const timeout = opts?.timeoutMs ?? 15 * 60_000;
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const state = await this.status(jobId, opts);
      if (state.status === 'succeeded' && state.assetUrl) {
        return { assetUrl: state.assetUrl, state };
      }
      if (state.status === 'failed' || state.status === 'canceled') {
        throw new Error(state.error || `ComfyUI job ${state.status}`);
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error('ComfyUI video generation timed out');
  },
};
