/**
 * Census Geocoder provider (default, free, US addresses).
 * Swappable later via GEOCODE_PROVIDER env.
 */

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
