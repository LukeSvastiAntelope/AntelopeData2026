/**
 * voter_geo + geofences repos (G1). Authoritative spatial queries live here;
 * src/lib/geofencing.ts remains client draw-preview only.
 */

import { openSql } from '@/app/utils/database/db';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import {
  isValidLatLng,
  parseCoord,
  pointWkt4326,
  polygonWkt4326FromLngLatRing,
} from '@/app/utils/services/geo/spatial';

export type GeocodeStatus = 'pending' | 'ok' | 'failed' | 'skipped' | 'provider';

export type VoterGeoRow = {
  id: number;
  organization_id: number | null;
  responder_agent_id: number | null;
  voter_file_id: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  party: string | null;
  partisan_score: number | null;
  turnout_score: number | null;
  latitude: number | null;
  longitude: number | null;
  geocode_status: GeocodeStatus;
  geocode_source: string | null;
  geocode_confidence: number | null;
};

export type GeofenceType = 'polygon' | 'circle';
export type GeofencePurpose = 'include' | 'exclude' | 'general';

export type GeofenceRow = {
  id: number;
  organization_id: number;
  label: string;
  fence_type: GeofenceType;
  purpose: GeofencePurpose;
  ring_json: [number, number][] | null;
  center_lat: number | null;
  center_lng: number | null;
  radius_m: number | null;
  color: string | null;
  notes: string | null;
  created_by: number;
  created_at: Date;
  updated_at: Date;
};

export class VoterGeoRepo {
  static async upsertPoint(params: {
    organizationId: number | null;
    responderAgentId?: number | null;
    voterFileId?: string | null;
    street?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
    party?: string | null;
    partisanScore?: number | null;
    turnoutScore?: number | null;
    latitude?: number | null;
    longitude?: number | null;
    geocodeStatus?: GeocodeStatus;
    geocodeSource?: string | null;
    geocodeConfidence?: number | null;
    geocodeError?: string | null;
  }): Promise<number> {
    const sql = await openSql();
    const lat = parseCoord(params.latitude);
    const lng = parseCoord(params.longitude);
    const hasPt = isValidLatLng(lat, lng);
    const status: GeocodeStatus = params.geocodeStatus
      ? params.geocodeStatus
      : hasPt
        ? 'ok'
        : 'pending';
    // SPATIAL INDEX requires NOT NULL — Null Island placeholder until geocoded
    const wkt = hasPt ? pointWkt4326(lat!, lng!) : pointWkt4326(0, 0);
    const party = params.party || null;
    const partisan =
      params.partisanScore != null && Number.isFinite(Number(params.partisanScore))
        ? Number(params.partisanScore)
        : null;
    const turnout =
      params.turnoutScore != null && Number.isFinite(Number(params.turnoutScore))
        ? Number(params.turnoutScore)
        : null;

    // Prefer agent unique key when present; else org+voter_file_id
    if (params.responderAgentId) {
      const [result] = await sql.execute<ResultSetHeader>(
        `INSERT INTO voter_geo (
           organization_id, responder_agent_id, voter_file_id,
           street, city, state, zip, party, partisan_score, turnout_score,
           latitude, longitude, pt,
           geocode_status, geocode_source, geocode_confidence, geocode_error
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ST_GeomFromText(?, 4326), ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           organization_id = COALESCE(VALUES(organization_id), organization_id),
           voter_file_id = COALESCE(VALUES(voter_file_id), voter_file_id),
           street = COALESCE(VALUES(street), street),
           city = COALESCE(VALUES(city), city),
           state = COALESCE(VALUES(state), state),
           zip = COALESCE(VALUES(zip), zip),
           party = COALESCE(VALUES(party), party),
           partisan_score = COALESCE(VALUES(partisan_score), partisan_score),
           turnout_score = COALESCE(VALUES(turnout_score), turnout_score),
           latitude = COALESCE(VALUES(latitude), latitude),
           longitude = COALESCE(VALUES(longitude), longitude),
           pt = IF(VALUES(geocode_status) IN ('ok', 'provider'), VALUES(pt), pt),
           geocode_status = VALUES(geocode_status),
           geocode_source = COALESCE(VALUES(geocode_source), geocode_source),
           geocode_confidence = COALESCE(VALUES(geocode_confidence), geocode_confidence),
           geocode_error = VALUES(geocode_error),
           updated_at = CURRENT_TIMESTAMP`,
        [
          params.organizationId,
          params.responderAgentId,
          params.voterFileId || null,
          params.street || null,
          params.city || null,
          params.state || null,
          params.zip || null,
          party,
          partisan,
          turnout,
          lat,
          lng,
          wkt,
          status,
          params.geocodeSource || (hasPt ? 'voter_file' : null),
          params.geocodeConfidence ?? (hasPt ? 0.95 : null),
          params.geocodeError || null,
        ]
      );
      return Number(result.insertId) || 0;
    }

    if (!params.voterFileId) {
      throw new Error('voterFileId or responderAgentId required for voter_geo upsert');
    }

    const [result] = await sql.execute<ResultSetHeader>(
      `INSERT INTO voter_geo (
         organization_id, responder_agent_id, voter_file_id,
         street, city, state, zip, party, partisan_score, turnout_score,
         latitude, longitude, pt,
         geocode_status, geocode_source, geocode_confidence, geocode_error
       ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ST_GeomFromText(?, 4326), ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         street = COALESCE(VALUES(street), street),
         city = COALESCE(VALUES(city), city),
         state = COALESCE(VALUES(state), state),
         zip = COALESCE(VALUES(zip), zip),
         party = COALESCE(VALUES(party), party),
         partisan_score = COALESCE(VALUES(partisan_score), partisan_score),
         turnout_score = COALESCE(VALUES(turnout_score), turnout_score),
         latitude = COALESCE(VALUES(latitude), latitude),
         longitude = COALESCE(VALUES(longitude), longitude),
         pt = IF(VALUES(geocode_status) IN ('ok', 'provider'), VALUES(pt), pt),
         geocode_status = VALUES(geocode_status),
         geocode_source = COALESCE(VALUES(geocode_source), geocode_source),
         geocode_confidence = COALESCE(VALUES(geocode_confidence), geocode_confidence),
         geocode_error = VALUES(geocode_error),
         updated_at = CURRENT_TIMESTAMP`,
      [
        params.organizationId,
        params.voterFileId,
        params.street || null,
        params.city || null,
        params.state || null,
        params.zip || null,
        party,
        partisan,
        turnout,
        lat,
        lng,
        wkt,
        status,
        params.geocodeSource || (hasPt ? 'voter_file' : null),
        params.geocodeConfidence ?? (hasPt ? 0.95 : null),
        params.geocodeError || null,
      ]
    );
    return Number(result.insertId) || 0;
  }

  static async listPendingGeocode(limit = 100): Promise<VoterGeoRow[]> {
    const sql = await openSql();
    const [rows] = await sql.execute(
      `SELECT id, organization_id, responder_agent_id, voter_file_id,
              street, city, state, zip, latitude, longitude,
              geocode_status, geocode_source, geocode_confidence
       FROM voter_geo
       WHERE geocode_status = 'pending' AND (street IS NOT NULL OR zip IS NOT NULL)
       ORDER BY id ASC
       LIMIT ${Math.min(Math.max(limit, 1), 500)}`
    );
    return rows as VoterGeoRow[];
  }

  static async markGeocoded(
    id: number,
    lat: number,
    lng: number,
    source: string,
    confidence: number
  ): Promise<void> {
    const sql = await openSql();
    const wkt = pointWkt4326(lat, lng);
    await sql.execute(
      `UPDATE voter_geo SET
         latitude = ?, longitude = ?,
         pt = ST_GeomFromText(?, 4326),
         geocode_status = 'ok',
         geocode_source = ?,
         geocode_confidence = ?,
         geocode_error = NULL,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [lat, lng, wkt, source, confidence, id]
    );
  }

  static async markFailed(id: number, error: string): Promise<void> {
    const sql = await openSql();
    await sql.execute(
      `UPDATE voter_geo SET geocode_status = 'failed', geocode_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [error.slice(0, 250), id]
    );
  }
}

export class GeofenceRepo {
  static async list(organizationId: number): Promise<GeofenceRow[]> {
    const sql = await openSql();
    const [rows] = await sql.execute(
      `SELECT id, organization_id, label, fence_type, purpose, ring_json,
              center_lat, center_lng, radius_m, color, notes, created_by, created_at, updated_at
       FROM geofences WHERE organization_id = ? ORDER BY label ASC`,
      [organizationId]
    );
    return (rows as any[]).map(normalizeFenceRow);
  }

  static async getById(id: number, organizationId: number): Promise<GeofenceRow | null> {
    const sql = await openSql();
    const [rows] = await sql.execute(
      `SELECT id, organization_id, label, fence_type, purpose, ring_json,
              center_lat, center_lng, radius_m, color, notes, created_by, created_at, updated_at
       FROM geofences WHERE id = ? AND organization_id = ? LIMIT 1`,
      [id, organizationId]
    );
    const row = (rows as any[])[0];
    return row ? normalizeFenceRow(row) : null;
  }

  static async getByLabel(label: string, organizationId: number): Promise<GeofenceRow | null> {
    const sql = await openSql();
    const [rows] = await sql.execute(
      `SELECT id, organization_id, label, fence_type, purpose, ring_json,
              center_lat, center_lng, radius_m, color, notes, created_by, created_at, updated_at
       FROM geofences WHERE organization_id = ? AND label = ? LIMIT 1`,
      [organizationId, label]
    );
    const row = (rows as any[])[0];
    return row ? normalizeFenceRow(row) : null;
  }

  static async create(params: {
    organizationId: number;
    createdBy: number;
    label: string;
    fenceType: GeofenceType;
    purpose?: GeofencePurpose;
    ring?: [number, number][];
    centerLat?: number | null;
    centerLng?: number | null;
    radiusM?: number | null;
    color?: string | null;
    notes?: string | null;
  }): Promise<GeofenceRow> {
    const sql = await openSql();
    const purpose = params.purpose || 'include';

    if (params.fenceType === 'polygon' && params.ring?.length) {
      const wkt = polygonWkt4326FromLngLatRing(params.ring);
      const [result] = await sql.execute<ResultSetHeader>(
        `INSERT INTO geofences
          (organization_id, label, fence_type, purpose, geom, ring_json,
           center_lat, center_lng, radius_m, color, notes, created_by)
         VALUES (?, ?, 'polygon', ?, ST_GeomFromText(?, 4326), ?, ?, ?, ?, ?, ?, ?)`,
        [
          params.organizationId,
          params.label.trim(),
          purpose,
          wkt,
          JSON.stringify(params.ring),
          params.centerLat ?? null,
          params.centerLng ?? null,
          params.radiusM ?? null,
          params.color || null,
          params.notes || null,
          params.createdBy,
        ]
      );
      const created = await this.getById(Number(result.insertId), params.organizationId);
      if (!created) throw new Error('Failed to load created geofence');
      return created;
    }

    if (params.fenceType === 'circle') {
      if (params.centerLat == null || params.centerLng == null || !params.radiusM) {
        throw new Error('Circle fence requires centerLat, centerLng, radiusM');
      }
      const centerWkt = pointWkt4326(params.centerLat, params.centerLng);
      const [result] = await sql.execute<ResultSetHeader>(
        `INSERT INTO geofences
          (organization_id, label, fence_type, purpose, geom, ring_json,
           center_lat, center_lng, radius_m, color, notes, created_by)
         VALUES (?, ?, 'circle', ?, ST_GeomFromText(?, 4326), NULL, ?, ?, ?, ?, ?, ?)`,
        [
          params.organizationId,
          params.label.trim(),
          purpose,
          centerWkt,
          params.centerLat,
          params.centerLng,
          params.radiusM,
          params.color || null,
          params.notes || null,
          params.createdBy,
        ]
      );
      const created = await this.getById(Number(result.insertId), params.organizationId);
      if (!created) throw new Error('Failed to load created geofence');
      return created;
    }

    throw new Error('Invalid fence payload');
  }

  static async rename(
    id: number,
    organizationId: number,
    label: string
  ): Promise<GeofenceRow | null> {
    const sql = await openSql();
    await sql.execute(
      `UPDATE geofences SET label = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND organization_id = ?`,
      [label.trim(), id, organizationId]
    );
    return this.getById(id, organizationId);
  }

  static async updateGeometry(
    id: number,
    organizationId: number,
    patch: {
      ring?: [number, number][];
      centerLat?: number | null;
      centerLng?: number | null;
      radiusM?: number | null;
      fenceType?: GeofenceType;
    }
  ): Promise<GeofenceRow | null> {
    const existing = await this.getById(id, organizationId);
    if (!existing) return null;
    const sql = await openSql();
    const fenceType = patch.fenceType || existing.fence_type;

    if (fenceType === 'polygon' && patch.ring?.length) {
      const wkt = polygonWkt4326FromLngLatRing(patch.ring);
      await sql.execute(
        `UPDATE geofences SET fence_type = 'polygon', geom = ST_GeomFromText(?, 4326),
           ring_json = ?, center_lat = NULL, center_lng = NULL, radius_m = NULL,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND organization_id = ?`,
        [wkt, JSON.stringify(patch.ring), id, organizationId]
      );
    } else if (fenceType === 'circle') {
      const lat = patch.centerLat ?? existing.center_lat;
      const lng = patch.centerLng ?? existing.center_lng;
      const radius = patch.radiusM ?? existing.radius_m;
      if (lat == null || lng == null || !radius) throw new Error('Circle update missing center/radius');
      const wkt = pointWkt4326(lat, lng);
      await sql.execute(
        `UPDATE geofences SET fence_type = 'circle', geom = ST_GeomFromText(?, 4326),
           ring_json = NULL, center_lat = ?, center_lng = ?, radius_m = ?,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND organization_id = ?`,
        [wkt, lat, lng, radius, id, organizationId]
      );
    }
    return this.getById(id, organizationId);
  }

  static async delete(id: number, organizationId: number): Promise<boolean> {
    const sql = await openSql();
    const [result] = await sql.execute<ResultSetHeader>(
      `DELETE FROM geofences WHERE id = ? AND organization_id = ?`,
      [id, organizationId]
    );
    return result.affectedRows > 0;
  }
}

function normalizeFenceRow(row: any): GeofenceRow {
  let ring: [number, number][] | null = null;
  if (row.ring_json) {
    try {
      ring = typeof row.ring_json === 'string' ? JSON.parse(row.ring_json) : row.ring_json;
    } catch {
      ring = null;
    }
  }
  return {
    id: Number(row.id),
    organization_id: Number(row.organization_id),
    label: row.label,
    fence_type: row.fence_type,
    purpose: row.purpose,
    ring_json: ring,
    center_lat: row.center_lat != null ? Number(row.center_lat) : null,
    center_lng: row.center_lng != null ? Number(row.center_lng) : null,
    radius_m: row.radius_m != null ? Number(row.radius_m) : null,
    color: row.color,
    notes: row.notes,
    created_by: Number(row.created_by),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export type AddressInFence = {
  id: number;
  voterFileId: string | null;
  responderAgentId: number | null;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  latitude: number;
  longitude: number;
  label: string;
};

/**
 * Authoritative spatial query: addresses inside a saved fence.
 * Uses SPATIAL INDEX via ST_Contains / ST_Distance_Sphere.
 */
export async function addressesInFence(
  fenceId: number,
  organizationId: number,
  opts?: { limit?: number }
): Promise<{ fence: GeofenceRow; addresses: AddressInFence[] }> {
  const fence = await GeofenceRepo.getById(fenceId, organizationId);
  if (!fence) throw new Error('Geofence not found');

  const sql = await openSql();
  const limit = Math.min(Math.max(opts?.limit || 5000, 1), 20000);

  let rows: any[];
  if (fence.fence_type === 'circle') {
    const [r] = await sql.execute(
      `SELECT vg.id, vg.voter_file_id, vg.responder_agent_id, vg.street, vg.city, vg.state, vg.zip,
              vg.latitude, vg.longitude
       FROM voter_geo vg
       JOIN geofences f ON f.id = ?
       WHERE vg.organization_id = ?
         AND vg.geocode_status IN ('ok', 'provider')
         AND f.center_lat IS NOT NULL AND f.center_lng IS NOT NULL AND f.radius_m IS NOT NULL
         AND ST_Distance_Sphere(vg.pt, f.geom) <= f.radius_m
       LIMIT ${limit}`,
      [fenceId, organizationId]
    );
    rows = r as any[];
  } else {
    const [r] = await sql.execute(
      `SELECT vg.id, vg.voter_file_id, vg.responder_agent_id, vg.street, vg.city, vg.state, vg.zip,
              vg.latitude, vg.longitude
       FROM voter_geo vg
       JOIN geofences f ON f.id = ?
       WHERE vg.organization_id = ?
         AND vg.geocode_status IN ('ok', 'provider')
         AND ST_Contains(f.geom, vg.pt)
       LIMIT ${limit}`,
      [fenceId, organizationId]
    );
    rows = r as any[];
  }

  const addresses: AddressInFence[] = rows.map((r) => ({
    id: Number(r.id),
    voterFileId: r.voter_file_id,
    responderAgentId: r.responder_agent_id != null ? Number(r.responder_agent_id) : null,
    street: r.street,
    city: r.city,
    state: r.state,
    zip: r.zip,
    latitude: Number(r.latitude),
    longitude: Number(r.longitude),
    label: [r.street, r.city, r.state, r.zip].filter(Boolean).join(', ') || `geo#${r.id}`,
  }));

  return { fence, addresses };
}
