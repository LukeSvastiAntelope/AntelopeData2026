/**
 * Data D3 — Census TIGER/cartographic state-legislative district boundaries.
 * Downloads per-state CB shapefile zips, converts to GeoJSON, normalizes
 * district_code, and caches in geo_boundary_cache (tenant-agnostic public geometry).
 */

import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { openSql } from '@/app/utils/database/db';
import { STATE_FIPS_MAP } from '@/app/utils/services/district-intel-service';

export type TigerLayer = 'sldl' | 'sldu';

export type BoundaryFeatureCollection = {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    properties: Record<string, unknown>;
    geometry: unknown;
  }>;
};

const TIGER_YEAR = 2023;

function tigerZipUrl(stateFips: string, layer: TigerLayer): string {
  // Census cartographic boundary files (500k) — public TIGER/Line product
  return `https://www2.census.gov/geo/tiger/GENZ${TIGER_YEAR}/shp/cb_${TIGER_YEAR}_${stateFips}_${layer}_500k.zip`;
}

function normalizeDistrictCode(
  state: string,
  layer: TigerLayer,
  rawNum: string | number
): { districtCode: string; districtNumber: number } {
  const n = parseInt(String(rawNum).replace(/\D/g, ''), 10);
  const districtNumber = Number.isFinite(n) ? n : 0;
  const prefix = layer === 'sldl' ? 'LD' : 'SD';
  return {
    districtNumber,
    districtCode: `${state}-${prefix}-${districtNumber}`,
  };
}

async function convertZipToGeoJson(
  buf: ArrayBuffer,
  layer: TigerLayer
): Promise<BoundaryFeatureCollection> {
  const shpMod = await import('shpjs');
  const parse = (shpMod as any).default || (shpMod as any).parseZip || shpMod;
  const geo = await parse(buf);
  const fc: BoundaryFeatureCollection = Array.isArray(geo)
    ? geo[0]
    : geo;

  const features = (fc.features || []).map((f) => {
    const p = f.properties || {};
    const state = String(p.STUSPS || '').toUpperCase();
    const raw =
      layer === 'sldl'
        ? p.SLDLST ?? p.NAME
        : p.SLDUST ?? p.NAME;
    const { districtCode, districtNumber } = normalizeDistrictCode(
      state,
      layer,
      raw as string
    );
    return {
      type: 'Feature' as const,
      properties: {
        ...p,
        state,
        district_code: districtCode,
        district_number: districtNumber,
        layer,
        name: p.NAMELSAD || p.NAME || districtCode,
      },
      geometry: f.geometry,
    };
  });

  return { type: 'FeatureCollection', features };
}

async function readCache(
  layer: TigerLayer,
  state: string
): Promise<BoundaryFeatureCollection | null> {
  try {
    const sql = await openSql();
    const [rows] = await sql.execute<RowDataPacket[]>(
      `SELECT geojson FROM geo_boundary_cache
       WHERE layer = ? AND state = ? AND year = ?
       LIMIT 1`,
      [layer, state, TIGER_YEAR]
    );
    if (!rows.length) return null;
    const raw = rows[0].geojson;
    const parsed =
      typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (parsed?.type === 'FeatureCollection') return parsed;
    return null;
  } catch (err) {
    console.warn('[tiger-boundaries] cache read skipped', err);
    return null;
  }
}

async function writeCache(
  layer: TigerLayer,
  state: string,
  fc: BoundaryFeatureCollection
): Promise<void> {
  try {
    const sql = await openSql();
    await sql.execute<ResultSetHeader>(
      `INSERT INTO geo_boundary_cache
        (layer, state, year, feature_count, geojson, fetched_at)
       VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP())
       ON DUPLICATE KEY UPDATE
         feature_count = VALUES(feature_count),
         geojson = VALUES(geojson),
         fetched_at = UTC_TIMESTAMP()`,
      [
        layer,
        state,
        TIGER_YEAR,
        fc.features.length,
        JSON.stringify(fc),
      ]
    );
  } catch (err) {
    console.warn('[tiger-boundaries] cache write skipped', err);
  }
}

/**
 * Get state legislative district boundaries (lower or upper chamber).
 * Fetches from Census TIGER CB files on miss; caches normalized GeoJSON.
 */
export async function getStateLegislativeBoundaries(input: {
  state: string;
  layer: TigerLayer;
  forceRefresh?: boolean;
}): Promise<{
  status: 'ok' | 'unavailable';
  layer: TigerLayer;
  state: string;
  year: number;
  geojson: BoundaryFeatureCollection;
  cached: boolean;
  message?: string;
}> {
  const state = String(input.state || '')
    .trim()
    .toUpperCase();
  const layer = input.layer;
  const empty: BoundaryFeatureCollection = {
    type: 'FeatureCollection',
    features: [],
  };

  if (!/^[A-Z]{2}$/.test(state) || !STATE_FIPS_MAP[state]) {
    return {
      status: 'unavailable',
      layer,
      state,
      year: TIGER_YEAR,
      geojson: empty,
      cached: false,
      message: 'Invalid state',
    };
  }

  if (!input.forceRefresh) {
    const cached = await readCache(layer, state);
    if (cached) {
      return {
        status: 'ok',
        layer,
        state,
        year: TIGER_YEAR,
        geojson: cached,
        cached: true,
      };
    }
  }

  const fips = STATE_FIPS_MAP[state];
  const url = tigerZipUrl(fips, layer);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'AntelopeDistrictIntel/1.0' },
    });
    if (!res.ok) {
      return {
        status: 'unavailable',
        layer,
        state,
        year: TIGER_YEAR,
        geojson: empty,
        cached: false,
        message: `Census TIGER HTTP ${res.status}`,
      };
    }
    const buf = await res.arrayBuffer();
    const fc = await convertZipToGeoJson(buf, layer);
    await writeCache(layer, state, fc);
    return {
      status: 'ok',
      layer,
      state,
      year: TIGER_YEAR,
      geojson: fc,
      cached: false,
    };
  } catch (err) {
    console.error('[tiger-boundaries] fetch failed', err);
    return {
      status: 'unavailable',
      layer,
      state,
      year: TIGER_YEAR,
      geojson: empty,
      cached: false,
      message: err instanceof Error ? err.message : 'Fetch failed',
    };
  }
}

/** Prefer sldl for state_house / sldu for state_senate. */
export function layerForOfficeType(
  officeType: string | null | undefined
): TigerLayer | null {
  if (officeType === 'state_house') return 'sldl';
  if (officeType === 'state_senate') return 'sldu';
  return null;
}
