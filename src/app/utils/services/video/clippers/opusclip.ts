/**
 * Opus Clip — proprietary SaaS clipper (api.opus.pro).
 * Env: OPUS_CLIP_API_KEY, optional OPUS_CLIP_ORG_ID
 */

import type {
  VideoClipCandidate,
  VideoClipProvider,
  VideoClipProviderCapabilities,
  VideoClipJobStatus,
  VideoClipSubmitOptions,
} from './types';

function apiKey(): string | null {
  return process.env.OPUS_CLIP_API_KEY || process.env.OPUSCLIP_API_KEY || null;
}

function orgId(): string | null {
  return process.env.OPUS_CLIP_ORG_ID || process.env.OPUSCLIP_ORG_ID || null;
}

function base(opts?: VideoClipSubmitOptions): string {
  return (opts?.endpointBase || 'https://api.opus.pro').replace(/\/$/, '');
}

function authHeaders(): HeadersInit {
  const key = apiKey();
  if (!key) throw new Error('OPUS_CLIP_API_KEY is not configured');
  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
  const org = orgId();
  if (org) headers['x-opus-org-id'] = org;
  return headers;
}

function encodeJobId(projectId: string): string {
  return `opus_${Buffer.from(projectId, 'utf8').toString('base64url')}`;
}

function decodeJobId(jobId: string): string {
  if (!jobId.startsWith('opus_')) throw new Error('Invalid Opus job id');
  return Buffer.from(jobId.slice(5), 'base64url').toString('utf8');
}

function mapStatus(raw: unknown): VideoClipJobStatus {
  const s = String(raw || '').toLowerCase();
  if (['completed', 'complete', 'done', 'succeeded', 'ready', 'finished'].includes(s)) {
    return 'succeeded';
  }
  if (['failed', 'error', 'cancelled', 'canceled'].includes(s)) return 'failed';
  if (['queued', 'pending', 'created'].includes(s)) return 'queued';
  return 'running';
}

function normalizeClip(raw: any, index: number, jobId: string): VideoClipCandidate {
  const url =
    raw?.url ||
    raw?.videoUrl ||
    raw?.video_url ||
    raw?.exportUrl ||
    raw?.mp4Url ||
    raw?.render?.url ||
    '';
  const scoreRaw =
    raw?.score ?? raw?.viralScore ?? raw?.viral_score ?? raw?.engagementScore ?? 50;
  const score = Math.max(0, Math.min(100, Number(scoreRaw) || 50));
  const hook =
    raw?.hook ||
    raw?.title ||
    raw?.caption ||
    raw?.text ||
    raw?.description ||
    `Clip ${index + 1}`;
  return {
    id: String(raw?.id || raw?.clipId || `${jobId}_${index}`),
    url: String(url),
    score,
    hook: String(hook).slice(0, 280),
    durationSeconds: raw?.duration || raw?.durationSec || raw?.duration_seconds,
    thumbnailUrl: raw?.thumbnailUrl || raw?.thumbnail || null,
    captions: raw?.hasCaptions !== false,
    raw,
  };
}

export const opusClipProvider: VideoClipProvider = {
  id: 'opusclip',
  capabilities(): VideoClipProviderCapabilities {
    return {
      id: 'opusclip',
      displayName: 'Opus Clip',
      tier: 'saas',
      notes: apiKey()
        ? 'Configured via OPUS_CLIP_API_KEY.'
        : 'Set OPUS_CLIP_API_KEY (optional OPUS_CLIP_ORG_ID) to enable.',
    };
  },
  async submit(sourceUrl: string, opts?: VideoClipSubmitOptions) {
    if (!apiKey()) throw new Error('OPUS_CLIP_API_KEY is not configured');
    const body: Record<string, unknown> = {
      videoUrl: sourceUrl,
      importPref: { sourceLang: opts?.language || 'en' },
      curationPref: {
        skipCurate: false,
        genre: 'Auto',
        clipDurations: [[0, opts?.maxDurationSeconds || 90]],
        topicKeywords: opts?.topicKeywords || undefined,
      },
    };
    const res = await fetch(`${base(opts)}/api/clip-projects`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(body),
      signal: opts?.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Opus Clip submit failed (${res.status}): ${text.slice(0, 400)}`);
    }
    const data = (await res.json()) as any;
    const projectId =
      data?.id || data?.projectId || data?.project_id || data?.data?.id;
    if (!projectId) throw new Error('Opus Clip did not return a project id');
    return { jobId: encodeJobId(String(projectId)) };
  },
  async status(jobId: string, opts?: VideoClipSubmitOptions) {
    const projectId = decodeJobId(jobId);
    // Prefer project detail when available; fall back to exportable-clips presence.
    try {
      const res = await fetch(`${base(opts)}/api/clip-projects/${projectId}`, {
        headers: authHeaders(),
        signal: opts?.signal,
      });
      if (res.ok) {
        const data = (await res.json()) as any;
        const status = mapStatus(
          data?.status || data?.state || data?.projectStatus || data?.phase
        );
        return {
          jobId,
          status,
          progress: status === 'succeeded' ? 100 : status === 'queued' ? 20 : 60,
          error: data?.error || data?.errorMessage || null,
        };
      }
    } catch {
      /* try clips endpoint */
    }

    const clipsRes = await fetch(
      `${base(opts)}/api/exportable-clips?q=findByProjectId&projectId=${encodeURIComponent(projectId)}`,
      { headers: authHeaders(), signal: opts?.signal }
    );
    if (!clipsRes.ok) {
      return {
        jobId,
        status: 'running',
        progress: 40,
        error: null,
      };
    }
    const clipsJson = (await clipsRes.json()) as any;
    const list = Array.isArray(clipsJson)
      ? clipsJson
      : clipsJson?.data || clipsJson?.clips || clipsJson?.items || [];
    if (Array.isArray(list) && list.length > 0) {
      return { jobId, status: 'succeeded', progress: 100 };
    }
    return { jobId, status: 'running', progress: 55 };
  },
  async clips(jobId: string, opts?: VideoClipSubmitOptions) {
    const projectId = decodeJobId(jobId);
    const res = await fetch(
      `${base(opts)}/api/exportable-clips?q=findByProjectId&projectId=${encodeURIComponent(projectId)}`,
      { headers: authHeaders(), signal: opts?.signal }
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Opus Clip clips failed (${res.status}): ${text.slice(0, 400)}`);
    }
    const data = (await res.json()) as any;
    const list = Array.isArray(data)
      ? data
      : data?.data || data?.clips || data?.items || [];
    return (list as any[])
      .map((c, i) => normalizeClip(c, i, jobId))
      .filter((c) => c.url)
      .sort((a, b) => b.score - a.score)
      .slice(0, opts?.maxClips || 12);
  },
};
