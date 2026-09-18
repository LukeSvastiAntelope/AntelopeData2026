/**
 * Kling — optional cinematic tier (proprietary).
 * Env: KLING_API_KEY, optional KLING_API_BASE
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

function apiKey(): string | null {
  return process.env.KLING_API_KEY || null;
}

function apiBase(opts?: VideoGenOptions): string {
  return (
    opts?.endpointBase ||
    process.env.KLING_API_BASE ||
    'https://api.klingai.com'
  ).replace(/\/$/, '');
}

export const klingVideoProvider: VideoGenProvider = {
  id: 'kling',
  capabilities(): VideoProviderCapabilities {
    return {
      id: 'kling',
      displayName: 'Kling (cinematic)',
      tier: 'cinematic',
      modes: ['t2v', 'i2v'],
      referenceTransport: ['url'],
      maxDurationSeconds: 10,
      notes: apiKey()
        ? 'Configured via KLING_API_KEY.'
        : 'Set KLING_API_KEY to enable. Proprietary cinematic tier.',
    };
  },
  async generate(
    request: VideoGenRequest,
    opts?: VideoGenOptions
  ): Promise<VideoJobHandle> {
    const key = apiKey();
    if (!key) throw new Error('KLING_API_KEY is not configured');
    if (request.mode === 'v2v') {
      throw new Error('Kling provider does not declare v2v support');
    }
    if (request.mode === 'i2v' && !request.referenceImage) {
      throw new Error('i2v requires referenceImage');
    }

    const res = await fetch(`${apiBase(opts)}/v1/videos/text2video`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: request.prompt,
        image: request.referenceImage || undefined,
        aspect_ratio: request.aspectRatio || '9:16',
        duration: String(request.durationSeconds || 5),
        model_name: opts?.model || 'kling-v1',
      }),
      signal: opts?.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Kling submit failed (${res.status}): ${text.slice(0, 400)}`);
    }
    const data = (await res.json()) as any;
    const id =
      data?.data?.task_id || data?.task_id || data?.id || randomUUID();
    return { jobId: `kling_${id}`, provider: 'kling' };
  },
  async status(jobId: string, opts?: VideoGenOptions): Promise<VideoJobState> {
    const key = apiKey();
    if (!key) {
      return {
        jobId,
        provider: 'kling',
        status: 'failed',
        error: 'KLING_API_KEY missing',
      };
    }
    const remoteId = jobId.replace(/^kling_/, '');
    const res = await fetch(
      `${apiBase(opts)}/v1/videos/text2video/${remoteId}`,
      {
        headers: { Authorization: `Bearer ${key}` },
        signal: opts?.signal,
      }
    );
    if (!res.ok) {
      return {
        jobId,
        provider: 'kling',
        status: 'failed',
        error: `Kling status ${res.status}`,
      };
    }
    const data = (await res.json()) as any;
    const task = data?.data || data;
    const statusRaw = String(task.task_status || task.status || '').toLowerCase();
    const status =
      statusRaw === 'succeed' || statusRaw === 'succeeded' || statusRaw === 'completed'
        ? 'succeeded'
        : statusRaw === 'failed'
          ? 'failed'
          : statusRaw.includes('queue')
            ? 'queued'
            : 'running';
    const assetUrl =
      task?.task_result?.videos?.[0]?.url ||
      task?.video_url ||
      task?.url ||
      null;
    return {
      jobId,
      provider: 'kling',
      status,
      progress: status === 'succeeded' ? 100 : 50,
      assetUrl,
      error: task?.task_status_msg || null,
      raw: data,
    };
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
        throw new Error(state.error || `Kling job ${state.status}`);
      }
      await new Promise((r) => setTimeout(r, 2500));
    }
    throw new Error('Kling video generation timed out');
  },
};
