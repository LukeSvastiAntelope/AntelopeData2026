import type {
  VideoGenProvider,
  VideoProviderCapabilities,
  VideoProviderId,
} from './types';
import { wanVideoProvider } from './wan';
import { higgsfieldVideoProvider } from './higgsfield';
import { klingVideoProvider } from './kling';
import { mockVideoProvider } from './mock';
import { comfyuiVideoProvider } from './comfyui';

const PROVIDERS: Record<VideoProviderId, VideoGenProvider> = {
  wan: wanVideoProvider,
  higgsfield: higgsfieldVideoProvider,
  kling: klingVideoProvider,
  mock: mockVideoProvider,
  comfyui: comfyuiVideoProvider,
};

/** Default: open Wan via fal when keyed; otherwise mock so the studio still works. */
export function getDefaultVideoProviderId(): VideoProviderId {
  const configured = (process.env.VIDEO_GEN_PROVIDER || '').trim().toLowerCase();
  if (configured && configured in PROVIDERS) {
    return configured as VideoProviderId;
  }
  if (process.env.FAL_KEY || process.env.FAL_API_KEY) return 'wan';
  if (process.env.COMFYUI_API_BASE) return 'comfyui';
  return 'mock';
}

export function getVideoProvider(id?: VideoProviderId | string | null): VideoGenProvider {
  const key = (id || getDefaultVideoProviderId()) as VideoProviderId;
  const provider = PROVIDERS[key];
  if (!provider) {
    throw new Error(`Unknown video provider: ${id}`);
  }
  return provider;
}

export function listVideoProviders(): VideoProviderCapabilities[] {
  return Object.values(PROVIDERS).map((p) => p.capabilities());
}

export type {
  VideoGenMode,
  VideoGenRequest,
  VideoGenOptions,
  VideoGenProvider,
  VideoJobHandle,
  VideoJobState,
  VideoProviderCapabilities,
  VideoProviderId,
  VideoAspectRatio,
} from './types';

export { isModeSupported } from './types';
