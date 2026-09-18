/**
 * Video clipping provider abstraction (V2).
 *
 * Generation (V1) and clipping (V2) are separate interfaces.
 * V3 in-house open clipper = another provider implementing this same contract.
 */

export type VideoClipProviderId = 'opusclip' | 'klap' | 'mock' | 'inhouse';

export type VideoClipJobStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'canceled';

export type VideoClipCandidate = {
  id: string;
  url: string;
  /** Viral / engagement score when the provider supplies one (0–100 normalized). */
  score: number;
  /** Hook / title / first-line caption from the provider. */
  hook: string;
  durationSeconds?: number;
  thumbnailUrl?: string | null;
  captions?: boolean;
  raw?: unknown;
};

export type VideoClipSubmitOptions = {
  language?: string;
  maxClips?: number;
  maxDurationSeconds?: number;
  /** Optional topic keywords for curation. */
  topicKeywords?: string[];
  /** Override API base (self-host / staging). */
  endpointBase?: string;
  signal?: AbortSignal;
};

export type VideoClipProviderCapabilities = {
  id: VideoClipProviderId;
  displayName: string;
  tier: 'saas' | 'mock' | 'self_host';
  notes?: string;
};

export interface VideoClipProvider {
  readonly id: VideoClipProviderId;
  capabilities(): VideoClipProviderCapabilities;
  submit(sourceUrl: string, opts?: VideoClipSubmitOptions): Promise<{ jobId: string }>;
  status(jobId: string, opts?: VideoClipSubmitOptions): Promise<{
    jobId: string;
    status: VideoClipJobStatus;
    progress?: number;
    error?: string | null;
  }>;
  clips(
    jobId: string,
    opts?: VideoClipSubmitOptions
  ): Promise<VideoClipCandidate[]>;
}
