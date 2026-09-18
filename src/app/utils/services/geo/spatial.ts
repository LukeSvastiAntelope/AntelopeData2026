/**
 * MySQL SRID 4326 geometry helpers.
 *
 * Axis-order gotcha: MySQL geographic SRS 4326 uses latitude-then-longitude in WKT.
 * MapLibre / GeoJSON rings are [lng, lat]. Always convert at the boundary.
 */

import { normalizeRing } from '@/lib/geofencing';

/** WKT POINT for MySQL SRID 4326 (lat lng order). */
export function pointWkt4326(lat: number, lng: number): string {
  return `POINT(${lat} ${lng})`;
}

/**
 * Convert a MapLibre ring [[lng,lat],...] to MySQL SRID 4326 POLYGON WKT.
 * Coordinates inside WKT are lat lng.
 */
export function polygonWkt4326FromLngLatRing(ring: [number, number][]): string {
  const closed = normalizeRing(ring);
  if (closed.length < 4) {
    throw new Error('Polygon ring needs at least 3 distinct vertices');
  }
  const coords = closed.map(([lng, lat]) => `${lat} ${lng}`).join(', ');
  return `POLYGON((${coords}))`;
}

/** GeoJSON Polygon (RFC7946 lng/lat) for ST_GeomFromGeoJSON if preferred. */
export function ringToGeoJsonPolygon(ring: [number, number][]): object {
  const closed = normalizeRing(ring);
  return {
    type: 'Polygon',
    coordinates: [closed.map(([lng, lat]) => [lng, lat])],
  };
}

export function parseCoord(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(n)) return null;
  return n;
}

export function isValidLatLng(lat: number | null, lng: number | null): boolean {
  if (lat == null || lng == null) return false;
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}
