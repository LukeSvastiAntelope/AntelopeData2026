/**
 * Wan 2.2 via fal.ai queue API (default open-model provider).
 * Self-host later = comfyui provider with the same interface.
 *
 * Env: FAL_KEY (or FAL_API_KEY)
 * Optional: FAL_WAN_T2V_MODEL, FAL_WAN_I2V_MODEL, FAL_WAN_V2V_MODEL
 */

import type {
  VideoGenMode,
  VideoGenOptions,
  VideoGenProvider,
  VideoGenRequest,
  VideoJobHandle,
  VideoJobState,
  VideoProviderCapabilities,
} from './types';

const DEFAULT_T2V = 'fal-ai/wan/v2.2-a14b-text-to-video';
const DEFAULT_I2V = 'fal-ai/wan/v2.2-a14b-image-to-video';
// fal may expose editing/v2v under a sibling id — override via env when available
const DEFAULT_V2V = process.env.FAL_WAN_V2V_MODEL || 'fal-ai/wan/v2.2-a14b-image-to-video';

function falKey(): string | null {
  return process.env.FAL_KEY || process.env.FAL_API_KEY || null;
}

function modelForMode(mode: VideoGenMode, opts?: VideoGenOptions): string {
  if (opts?.model) return opts.model;
  if (mode === 'i2v') return process.env.FAL_WAN_I2V_MODEL || DEFAULT_I2V;
  if (mode === 'v2v') return process.env.FAL_WAN_V2V_MODEL || DEFAULT_V2V;
  return process.env.FAL_WAN_T2V_MODEL || DEFAULT_T2V;
}

function queueBase(opts?: VideoGenOptions): string {
  return (opts?.endpointBase || 'https://queue.fal.run').replace(/\/$/, '');
}

function authHeaders(): HeadersInit {
  const key = falKey();
  if (!key) throw new Error('FAL_KEY is not configured');
  return {
    Authorization: `Key ${key}`,
    'Content-Type': 'application/json',
  };
}

function mapStatus(raw: string | undefined): VideoJobState['status'] {
  const s = String(raw || '').toUpperCase();
  if (s === 'COMPLETED' || s === 'OK') return 'succeeded';
  if (s === 'FAILED' || s === 'ERROR') return 'failed';
  if (s === 'IN_PROGRESS' || s === 'RUNNING') return 'running';
  if (s === 'IN_QUEUE' || s === 'QUEUED') return 'queued';
  if (s === 'CANCELLED' || s === 'CANCELED') return 'canceled';
  return 'running';
}

function extractAssetUrl(payload: any): string | null {
  if (!payload) return null;
  const candidates = [
    payload?.video?.url,
    payload?.video_url,
    payload?.output?.url,
    payload?.output?.video?.url,
    Array.isArray(payload?.video) ? payload.video[0]?.url : null,
    Array.isArray(payload?.images) ? payload.images[0]?.url : null,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.startsWith('http')) return c;
  }
  return null;
}

function buildBody(request: VideoGenRequest): Record<string, unknown> {
  const body: Record<string, unknown> = {
    prompt: request.prompt,
    negative_prompt: request.negativePrompt || undefined,
    aspect_ratio: request.aspectRatio || '9:16',
  };
  if (request.durationSeconds) {
    body.num_frames = Math.round(request.durationSeconds * 16); // ~16fps heuristic
  }
  if (request.mode === 'i2v' && request.referenceImage) {
    body.image_url = request.referenceImage;
  }
  if (request.mode === 'v2v') {
    if (request.referenceVideo) body.video_url = request.referenceVideo;
    else if (request.referenceImage) body.image_url = request.referenceImage;
  }
  return body;
}

/** Encode provider job as wan:{model}:{request_id} */
function encodeJobId(model: string, requestId: string, statusUrl?: string): string {
  const payload = Buffer.from(
    JSON.stringify({ model, requestId, statusUrl: statusUrl || null }),
    'utf8'
  ).toString('base64url');
  return `wan_${payload}`;
}

function decodeJobId(jobId: string): {
  model: string;
  requestId: string;
  statusUrl: string | null;
} {
  if (!jobId.startsWith('wan_')) throw new Error('Invalid Wan job id');
  const raw = Buffer.from(jobId.slice(4), 'base64url').toString('utf8');
  return JSON.parse(raw);
}

export const wanVideoProvider: VideoGenProvider = {
  id: 'wan',
  capabilities(): VideoProviderCapabilities {
    const hasV2v = Boolean(process.env.FAL_WAN_V2V_MODEL);
    return {
      id: 'wan',
      displayName: 'Wan 2.2 (fal.ai)',
      tier: 'open',
      modes: hasV2v ? ['t2v', 'i2v', 'v2v'] : ['t2v', 'i2v'],
      referenceTransport: ['url'],
      maxDurationSeconds: 10,
      notes:
        'Open model via managed fal.ai queue. Set FAL_KEY. Override models with FAL_WAN_*_MODEL. For true v2v set FAL_WAN_V2V_MODEL.',
    };
  },
  async generate(
    request: VideoGenRequest,
    opts?: VideoGenOptions
  ): Promise<VideoJobHandle> {
    if (!falKey()) {
      throw new Error('FAL_KEY is required for the Wan provider');
    }
    if (request.mode === 'i2v' && !request.referenceImage) {
      throw new Error('i2v mode requires referenceImage');
    }
    if (request.mode === 'v2v' && !request.referenceVideo && !request.referenceImage) {
      throw new Error('v2v mode requires referenceVideo or referenceImage');
    }
    if (request.mode === 'v2v' && !this.capabilities().modes.includes('v2v')) {
      throw new Error(
        'Wan v2v is not configured — set FAL_WAN_V2V_MODEL or pick another provider'
      );
    }

    const model = modelForMode(request.mode, opts);
    const url = `${queueBase(opts)}/${model}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(buildBody(request)),
      signal: opts?.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Wan/fal submit failed (${res.status}): ${text.slice(0, 400)}`);
    }
    const data = (await res.json()) as {
      request_id?: string;
      status_url?: string;
      response_url?: string;
    };
    if (!data.request_id) {
      throw new Error('Wan/fal did not return request_id');
    }
    return {
      jobId: encodeJobId(model, data.request_id, data.status_url),
      provider: 'wan',
    };
  },
  async status(jobId: string, opts?: VideoGenOptions): Promise<VideoJobState> {
    const { model, requestId, statusUrl } = decodeJobId(jobId);
    const url =
      statusUrl ||
      `${queueBase(opts)}/${model}/requests/${requestId}/status`;
    const res = await fetch(url, {
      headers: authHeaders(),
      signal: opts?.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return {
        jobId,
        provider: 'wan',
        status: 'failed',
        error: `status ${res.status}: ${text.slice(0, 300)}`,
      };
    }
    const data = (await res.json()) as any;
    const status = mapStatus(data.status);
    let assetUrl: string | null = null;
    if (status === 'succeeded') {
      // Fetch result payload
      const resultUrl =
        data.response_url ||
        `${queueBase(opts)}/${model}/requests/${requestId}`;
      const resultRes = await fetch(resultUrl, {
        headers: authHeaders(),
        signal: opts?.signal,
      });
      if (resultRes.ok) {
        const resultJson = await resultRes.json();
        assetUrl = extractAssetUrl(resultJson);
      }
    }
    return {
      jobId,
      provider: 'wan',
      status,
      progress:
        status === 'succeeded' ? 100 : status === 'queued' ? 15 : 55,
      assetUrl,
      error: data.error || data.error_message || null,
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
        throw new Error(state.error || `Wan job ${state.status}`);
      }
      await new Promise((r) => setTimeout(r, 2500));
    }
    throw new Error('Wan video generation timed out');
  },
};
