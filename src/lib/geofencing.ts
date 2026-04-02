/**
 * Geofencing helpers for canvass planning (polygon rings in [lng, lat]).
 */

export type GeofenceMode = 'include' | 'exclude'

export interface GeofencePolygon {
  id: string
  mode: GeofenceMode
  /** Closed ring: first point should equal last for MapLibre; we normalize in helpers */
  ring: [number, number][]
}

export interface CanvassAddress {
  id: string
  lng: number
  lat: number
  label?: string
  /** Derived from fences */
  status: 'canvass' | 'skip' | 'neutral'
}

/** Ray-casting point-in-polygon. Ring is closed or open (we close if needed). */
export function pointInPolygon(lng: number, lat: number, ring: [number, number][]): boolean {
  if (ring.length < 3) return false
  const closed = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
    ? ring
    : [...ring, ring[0]]
  let inside = false
  for (let i = 0, j = closed.length - 2; i < closed.length - 1; j = i++) {
    const xi = closed[i][0]
    const yi = closed[i][1]
    const xj = closed[j][0]
    const yj = closed[j][1]
    const intersect =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi
    if (intersect) inside = !inside
  }
  return inside
}

export function normalizeRing(ring: [number, number][]): [number, number][] {
  if (ring.length < 3) return ring
  const first = ring[0]
  const last = ring[ring.length - 1]
  if (first[0] === last[0] && first[1] === last[1]) return ring
  return [...ring, first]
}

export function classifyCanvassPoint(
  lng: number,
  lat: number,
  fences: GeofencePolygon[]
): 'canvass' | 'skip' | 'neutral' {
  if (!fences.length) return 'neutral'

  for (const f of fences) {
    if (f.mode === 'exclude' && pointInPolygon(lng, lat, normalizeRing(f.ring))) {
      return 'skip'
    }
  }

  const includes = fences.filter((f) => f.mode === 'include')
  if (includes.length === 0) {
    return 'canvass'
  }

  for (const f of includes) {
    if (pointInPolygon(lng, lat, normalizeRing(f.ring))) {
      return 'canvass'
    }
  }
  return 'skip'
}

export function classifyAddresses(
  rows: { id: string; lng: number; lat: number; label?: string }[],
  fences: GeofencePolygon[]
): CanvassAddress[] {
  return rows.map((r) => ({
    ...r,
    status: fences.length ? classifyCanvassPoint(r.lng, r.lat, fences) : 'neutral',
  }))
}
