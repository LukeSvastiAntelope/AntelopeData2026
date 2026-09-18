import type {
  VideoClipProvider,
  VideoClipProviderCapabilities,
  VideoClipProviderId,
} from './types';
import { opusClipProvider } from './opusclip';
import { klapClipProvider } from './klap';
import { mockClipProvider } from './mock';

const PROVIDERS: Record<Exclude<VideoClipProviderId, 'inhouse'>, VideoClipProvider> = {
  opusclip: opusClipProvider,
  klap: klapClipProvider,
  mock: mockClipProvider,
};

/**
 * Default clipper: Opus when keyed, else Klap, else mock.
 * V3 in-house open clipper would register as `inhouse` here — not built yet.
 */
export function getDefaultClipProviderId(): VideoClipProviderId {
  const configured = (process.env.VIDEO_CLIP_PROVIDER || '').trim().toLowerCase();
  if (configured === 'opusclip' || configured === 'klap' || configured === 'mock') {
    return configured;
  }
  if (process.env.OPUS_CLIP_API_KEY || process.env.OPUSCLIP_API_KEY) return 'opusclip';
  if (process.env.KLAP_API_KEY) return 'klap';
  return 'mock';
}

export function getClipProvider(
  id?: VideoClipProviderId | string | null
): VideoClipProvider {
  const key = (id || getDefaultClipProviderId()) as VideoClipProviderId;
  if (key === 'inhouse') {
    throw new Error(
      'In-house open clipper (V3) is not built yet — use opusclip, klap, or mock.'
    );
  }
  const provider = PROVIDERS[key];
  if (!provider) throw new Error(`Unknown clip provider: ${id}`);
  return provider;
}

export function listClipProviders(): VideoProviderList {
  return Object.values(PROVIDERS).map((p) => p.capabilities());
}

type VideoProviderList = VideoClipProviderCapabilities[];

export type {
  VideoClipProvider,
  VideoClipProviderId,
  VideoClipCandidate,
  VideoClipSubmitOptions,
  VideoClipJobStatus,
  VideoClipProviderCapabilities,
} from './types';
