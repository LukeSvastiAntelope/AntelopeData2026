/**
 * Video generation provider abstraction (V1).
 *
 * Swap fal/Replicate → self-hosted Wan/ComfyUI by adding a provider that
 * implements the same interface — callers never change.
 */

export type VideoGenMode = 't2v' | 'i2v' | 'v2v';

export type VideoAspectRatio = '9:16' | '16:9' | '1:1';

export type VideoProviderId = 'wan' | 'higgsfield' | 'kling' | 'mock' | 'comfyui';

export type VideoGenRequest = {
  prompt: string;
  /** Absolute or app-relative URL, or data: URL / base64 when provider requires it. */
  referenceImage?: string | null;
  referenceVideo?: string | null;
  mode: VideoGenMode;
  aspectRatio?: VideoAspectRatio;
  durationSeconds?: number;
  /** Negative prompt / style extras when the model supports them. */
  negativePrompt?: string | null;
};

export type VideoGenOptions = {
  /** Override endpoint base (self-host / staging). */
  endpointBase?: string;
  /** Provider-specific model id. */
  model?: string;
  /** Poll timeout ms (default 10 min). */
  timeoutMs?: number;
  signal?: AbortSignal;
};

export type VideoJobStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'canceled';

export type VideoJobHandle = {
  jobId: string;
  provider: VideoProviderId;
};

export type VideoJobState = {
  jobId: string;
  provider: VideoProviderId;
  status: VideoJobStatus;
  progress?: number;
  error?: string | null;
  assetUrl?: string | null;
  raw?: unknown;
};

export type VideoProviderCapabilities = {
  id: VideoProviderId;
  displayName: string;
  /** Open-weight default vs proprietary cinematic tier. */
  tier: 'open' | 'cinematic' | 'self_host' | 'mock';
  modes: VideoGenMode[];
  /** How reference assets are preferred. */
  referenceTransport: ('url' | 'base64')[];
  maxDurationSeconds: number;
  notes?: string;
};

export interface VideoGenProvider {
  readonly id: VideoProviderId;
  capabilities(): VideoProviderCapabilities;
  generate(
    request: VideoGenRequest,
    opts?: VideoGenOptions
  ): Promise<VideoJobHandle>;
  status(jobId: string, opts?: VideoGenOptions): Promise<VideoJobState>;
  result(jobId: string, opts?: VideoGenOptions): Promise<{
    assetUrl: string;
    state: VideoJobState;
  }>;
}

export function isModeSupported(
  caps: VideoProviderCapabilities,
  mode: VideoGenMode
): boolean {
  return caps.modes.includes(mode);
}
