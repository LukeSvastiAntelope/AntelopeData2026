/**
 * Census Geocoder provider (default, free, US addresses).
 * Swappable later via GEOCODE_PROVIDER env.
 */

import { VoterGeoRepo } from '@/app/utils/database/geo-repo';

export type GeocodeResult = {
  ok: true;
  latitude: number;
  longitude: number;
  confidence: number;
  source: 'census';
} | {
  ok: false;
  error: string;
};

export type GeocodeDrainSummary = {
  considered: number;
  ok: number;
  failed: number;
};

export async function geocodeAddressCensus(params: {
  street?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}): Promise<GeocodeResult> {
  const street = (params.street || '').trim();
  const city = (params.city || '').trim();
  const state = (params.state || '').trim();
  const zip = (params.zip || '').trim();
  if (!street && !zip) {
    return { ok: false, error: 'street or zip required' };
  }

  const qs = new URLSearchParams({
    benchmark: 'Public_AR_Current',
    format: 'json',
  });
  if (street) qs.set('street', street);
  if (city) qs.set('city', city);
  if (state) qs.set('state', state);
  if (zip) qs.set('zip', zip);

  const url = `https://geocoding.geo.census.gov/geocoder/locations/address?${qs.toString()}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return { ok: false, error: `Census HTTP ${res.status}` };
    const data = await res.json();
    const match = data?.result?.addressMatches?.[0];
    const coords = match?.coordinates;
    if (!coords || coords.y == null || coords.x == null) {
      return { ok: false, error: 'No Census match' };
    }
    // Census returns x=longitude, y=latitude
    return {
      ok: true,
      latitude: Number(coords.y),
      longitude: Number(coords.x),
      confidence: match.tigerLine ? 0.85 : 0.7,
      source: 'census',
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Census geocode failed',
    };
  }
}

export async function geocodeAddress(params: {
  street?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}): Promise<GeocodeResult> {
  const provider = (process.env.GEOCODE_PROVIDER || 'census').toLowerCase();
  if (provider === 'census') return geocodeAddressCensus(params);
  // Future: mapbox / google — same result shape
  return geocodeAddressCensus(params);
}

/**
 * Drain voter_geo rows with geocode_status=pending.
 * Used by platform cron and post-import background work — never block upload.
 */
export async function drainPendingGeocode(options?: {
  limit?: number;
  delayMs?: number;
}): Promise<GeocodeDrainSummary> {
  const limit = Math.max(1, Math.min(500, options?.limit ?? 100));
  const delayMs = Math.max(0, options?.delayMs ?? 250);
  const pending = await VoterGeoRepo.listPendingGeocode(limit);

  let ok = 0;
  let failed = 0;
  for (const row of pending) {
    const result = await geocodeAddress({
      street: row.street,
      city: row.city,
      state: row.state,
      zip: row.zip,
    });
    if (result.ok === true) {
      await VoterGeoRepo.markGeocoded(
        row.id,
        result.latitude,
        result.longitude,
        result.source,
        result.confidence
      );
      ok++;
    } else {
      const message = result.ok === false ? result.error : 'geocode failed';
      await VoterGeoRepo.markFailed(row.id, message);
      failed++;
    }
    if (delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  return { considered: pending.length, ok, failed };
}
