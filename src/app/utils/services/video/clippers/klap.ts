/**
 * Klap — proprietary SaaS clipper (api.klap.app / docs.klap.app).
 * Env: KLAP_API_KEY
 */

import type {
  VideoClipCandidate,
  VideoClipProvider,
  VideoClipProviderCapabilities,
  VideoClipJobStatus,
  VideoClipSubmitOptions,
} from './types';

function apiKey(): string | null {
  return process.env.KLAP_API_KEY || null;
}

function base(opts?: VideoClipSubmitOptions): string {
  return (
    opts?.endpointBase ||
    process.env.KLAP_API_BASE ||
    'https://api.klap.app/v2'
  ).replace(/\/$/, '');
}

function authHeaders(): HeadersInit {
  const key = apiKey();
  if (!key) throw new Error('KLAP_API_KEY is not configured');
  return {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

/** Encode taskId + optional output folder id once known. */
function encodeJobId(taskId: string, outputId?: string | null): string {
  return `klap_${Buffer.from(
    JSON.stringify({ taskId, outputId: outputId || null }),
    'utf8'
  ).toString('base64url')}`;
}

function decodeJobId(jobId: string): { taskId: string; outputId: string | null } {
  if (!jobId.startsWith('klap_')) throw new Error('Invalid Klap job id');
  return JSON.parse(Buffer.from(jobId.slice(5), 'base64url').toString('utf8'));
}

function mapStatus(raw: unknown): VideoClipJobStatus {
  const s = String(raw || '').toLowerCase();
  if (['ready', 'succeeded', 'completed', 'done'].includes(s)) return 'succeeded';
  if (['error', 'failed', 'canceled', 'cancelled'].includes(s)) return 'failed';
  if (['queued', 'pending'].includes(s)) return 'queued';
  return 'running';
}

function normalizeProject(raw: any, index: number, jobId: string): VideoClipCandidate {
  const url =
    raw?.url ||
    raw?.video_url ||
    raw?.export_url ||
    raw?.preview_url ||
    raw?.src ||
    '';
  const scoreRaw = raw?.virality_score ?? raw?.score ?? raw?.viral_score ?? 50;
  const score = Math.max(0, Math.min(100, Number(scoreRaw) || 50));
  const hook =
    raw?.name ||
    raw?.title ||
    raw?.hook ||
    raw?.caption ||
    raw?.transcript_preview ||
    `Short ${index + 1}`;
  return {
    id: String(raw?.id || `${jobId}_${index}`),
    url: String(url),
    score,
    hook: String(hook).slice(0, 280),
    durationSeconds: raw?.duration || raw?.duration_seconds,
    thumbnailUrl: raw?.thumbnail_url || raw?.thumbnail || null,
    captions: true,
    raw,
  };
}

export const klapClipProvider: VideoClipProvider = {
  id: 'klap',
  capabilities(): VideoClipProviderCapabilities {
    return {
      id: 'klap',
      displayName: 'Klap',
      tier: 'saas',
      notes: apiKey()
        ? 'Configured via KLAP_API_KEY.'
        : 'Set KLAP_API_KEY to enable. Bearer auth against api.klap.app/v2.',
    };
  },
  async submit(sourceUrl: string, opts?: VideoClipSubmitOptions) {
    if (!apiKey()) throw new Error('KLAP_API_KEY is not configured');
    const res = await fetch(`${base(opts)}/tasks/video-to-shorts`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        source_video_url: sourceUrl,
        language: opts?.language || 'en',
        max_duration: opts?.maxDurationSeconds || 30,
        max_clip_count: opts?.maxClips || 5,
        editing_options: { captions: true, reframe: true },
      }),
      signal: opts?.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Klap submit failed (${res.status}): ${text.slice(0, 400)}`);
    }
    const data = (await res.json()) as any;
    const taskId = data?.id || data?.task_id;
    if (!taskId) throw new Error('Klap did not return a task id');
    return { jobId: encodeJobId(String(taskId), data?.output_id || null) };
  },
  async status(jobId: string, opts?: VideoClipSubmitOptions) {
    const { taskId } = decodeJobId(jobId);
    const res = await fetch(`${base(opts)}/tasks/${taskId}`, {
      headers: authHeaders(),
      signal: opts?.signal,
    });
    if (!res.ok) {
      return {
        jobId,
        status: 'failed',
        error: `Klap status ${res.status}`,
      };
    }
    const data = (await res.json()) as any;
    return {
      jobId: encodeJobId(taskId, data?.output_id || null),
      status: mapStatus(data?.status),
      progress:
        mapStatus(data?.status) === 'succeeded'
          ? 100
          : mapStatus(data?.status) === 'queued'
            ? 20
            : 60,
      error: data?.error || data?.message || null,
    };
  },
  async clips(jobId: string, opts?: VideoClipSubmitOptions) {
    let { taskId, outputId } = decodeJobId(jobId);
    if (!outputId) {
      const st = await fetch(`${base(opts)}/tasks/${taskId}`, {
        headers: authHeaders(),
        signal: opts?.signal,
      });
      if (!st.ok) throw new Error(`Klap task fetch failed (${st.status})`);
      const task = (await st.json()) as any;
      if (mapStatus(task.status) !== 'succeeded') {
        throw new Error('Klap clips not ready yet');
      }
      outputId = task.output_id || null;
    }
    if (!outputId) throw new Error('Klap task has no output_id');

    const res = await fetch(`${base(opts)}/projects/${outputId}`, {
      headers: authHeaders(),
      signal: opts?.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Klap projects failed (${res.status}): ${text.slice(0, 400)}`);
    }
    const data = (await res.json()) as any;
    const list = Array.isArray(data)
      ? data
      : data?.projects || data?.items || data?.data || [];
    return (list as any[])
      .map((c, i) => normalizeProject(c, i, jobId))
      .filter((c) => c.url)
      .sort((a, b) => b.score - a.score)
      .slice(0, opts?.maxClips || 12);
  },
};
