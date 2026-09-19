/**
 * Person records serving layer (D1 output).
 * D2 map filters + D3 door-knock confirmation write-back.
 */

import { openSql } from '@/app/utils/database/db';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import { createHash } from 'crypto';
import { resolvePropensityForOrchestrator } from '@/app/utils/propensity/blend';
import { eventsFromPersonCanvass } from '@/app/utils/propensity/evidence';

export type CanvassStatus =
  | 'not_contacted'
  | 'contacted'
  | 'confirmed'
  | 'not_home'
  | 'refused'
  | 'moved'
  | 'wrong_address';

export type PersonRecordRow = {
  id: number;
  organization_id: number | null;
  cluster_key: string;
  address_point_id: number | null;
  first_name: string | null;
  last_name: string | null;
  full_name_normalized: string | null;
  email: string | null;
  phone: string | null;
  birthdate: string | null;
  age_years: number | null;
  age_bucket: string | null;
  party: string | null;
  gender: string | null;
  voter_status: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  owner_occupied: number | null;
  property_type: string | null;
  match_confidence: number;
  canvass_status: CanvassStatus | string | null;
  canvass_party: string | null;
  canvass_notes: string | null;
  canvass_confirmed_at: Date | string | null;
  canvass_by_user_id: number | null;
  field_provenance: unknown;
  source_row_ids: unknown;
  latitude: number | null;
  longitude: number | null;
  created_at: Date;
  updated_at: Date;
};

export type PersonMapFilters = {
  organizationId?: number | null;
  party?: string[];
  ageBucket?: string[];
  voterStatus?: string[];
  district?: string[];
  zip?: string[];
  ownerOccupied?: boolean | null;
  canvassStatus?: string[];
  minConfidence?: number;
  bbox?: { west: number; south: number; east: number; north: number };
  limit?: number;
};

export type PersonUpsertInput = {
  clusterKey: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  street?: string | null;
  unit?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  birthdate?: string | null;
  ageYears?: number | null;
  ageBucket?: string | null;
  party?: string | null;
  gender?: string | null;
  voterStatus?: string | null;
  district?: string | null;
  ownerOccupied?: boolean | null;
  propertyType?: string | null;
  matchConfidence?: number;
  latitude?: number | null;
  longitude?: number | null;
  fieldProvenance?: unknown;
  sourceRowIds?: string[];
};

function ageBucketFromYears(age: number | null): string | null {
  if (age == null || !Number.isFinite(age)) return null;
  if (age < 25) return '18-24';
  if (age < 35) return '25-34';
  if (age < 45) return '35-44';
  if (age < 55) return '45-54';
  if (age < 65) return '55-64';
  return '65+';
}

export class PersonRepo {
  static async listForMap(filters: PersonMapFilters = {}): Promise<PersonRecordRow[]> {
    const sql = await openSql();
    const where: string[] = ['latitude IS NOT NULL', 'longitude IS NOT NULL'];
    const params: unknown[] = [];

    if (filters.organizationId != null) {
      where.push('organization_id = ?');
      params.push(filters.organizationId);
    }
    if (filters.party?.length) {
      // Effective lean: door-confirmed party wins when present
      where.push(
        `COALESCE(NULLIF(canvass_party, ''), party) IN (${filters.party.map(() => '?').join(',')})`
      );
      params.push(...filters.party);
    }
    if (filters.ageBucket?.length) {
      where.push(`age_bucket IN (${filters.ageBucket.map(() => '?').join(',')})`);
      params.push(...filters.ageBucket);
    }
    if (filters.voterStatus?.length) {
      where.push(`voter_status IN (${filters.voterStatus.map(() => '?').join(',')})`);
      params.push(...filters.voterStatus);
    }
    if (filters.district?.length) {
      where.push(`district IN (${filters.district.map(() => '?').join(',')})`);
      params.push(...filters.district);
    }
    if (filters.zip?.length) {
      where.push(`zip IN (${filters.zip.map(() => '?').join(',')})`);
      params.push(...filters.zip);
    }
    if (filters.ownerOccupied != null) {
      where.push('owner_occupied = ?');
      params.push(filters.ownerOccupied ? 1 : 0);
    }
    if (filters.canvassStatus?.length) {
      where.push(
        `IFNULL(canvass_status, 'not_contacted') IN (${filters.canvassStatus.map(() => '?').join(',')})`
      );
      params.push(...filters.canvassStatus);
    }
    if (filters.minConfidence != null) {
      where.push('match_confidence >= ?');
      params.push(filters.minConfidence);
    }
    if (filters.bbox) {
      where.push('longitude BETWEEN ? AND ? AND latitude BETWEEN ? AND ?');
      params.push(filters.bbox.west, filters.bbox.east, filters.bbox.south, filters.bbox.north);
    }

    const limit = Math.min(Math.max(filters.limit || 5000, 1), 20000);
    const [rows] = await sql.execute(
      `SELECT * FROM person_records WHERE ${where.join(' AND ')} ORDER BY id ASC LIMIT ${limit}`,
      params
    );
    return rows as PersonRecordRow[];
  }

  static async getById(
    id: number,
    organizationId: number | null
  ): Promise<PersonRecordRow | null> {
    const sql = await openSql();
    const [rows] = await sql.execute(
      `SELECT * FROM person_records WHERE id = ? AND organization_id <=> ? LIMIT 1`,
      [id, organizationId]
    );
    const list = rows as PersonRecordRow[];
    return list[0] || null;
  }

  static async countByOrg(organizationId: number | null): Promise<number> {
    const sql = await openSql();
    const [rows] = await sql.execute(
      `SELECT COUNT(*) AS c FROM person_records WHERE organization_id <=> ?`,
      [organizationId]
    );
    return Number((rows as RowDataPacket[])[0]?.c || 0);
  }

  static async confirmInPerson(params: {
    id: number;
    organizationId: number | null;
    userId: number;
    status: CanvassStatus;
    party?: string | null;
    notes?: string | null;
    /** When true, also overwrite the golden `party` field with door-confirmed lean. */
    applyPartyToRecord?: boolean;
  }): Promise<PersonRecordRow | null> {
    const sql = await openSql();
    const existing = await this.getById(params.id, params.organizationId);
    if (!existing) return null;

    const party = params.party?.trim() || null;
    await sql.execute(
      `UPDATE person_records SET
         canvass_status = ?,
         canvass_party = COALESCE(?, canvass_party),
         canvass_notes = COALESCE(?, canvass_notes),
         canvass_confirmed_at = CURRENT_TIMESTAMP,
         canvass_by_user_id = ?,
         party = IF(?, COALESCE(?, party), party),
         updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND organization_id <=> ?`,
      [
        params.status,
        party,
        params.notes?.trim() || null,
        params.userId,
        params.applyPartyToRecord && party ? 1 : 0,
        party,
        params.id,
        params.organizationId,
      ]
    );

    // P2: incremental refresh of materialized propensity view
    if (params.organizationId != null) {
      try {
        const { PropensityRepo } = await import('@/app/utils/database/propensity-repo');
        await PropensityRepo.refreshPerson(params.id, params.organizationId);
      } catch (e) {
        console.warn('[propensity refresh after canvass]', e);
      }
    }

    return this.getById(params.id, params.organizationId);
  }

  static async upsertFromUpload(
    organizationId: number | null,
    rows: PersonUpsertInput[]
  ): Promise<{ upserted: number }> {
    const sql = await openSql();
    let upserted = 0;

    for (const row of rows) {
      const clusterKey =
        row.clusterKey ||
        createHash('sha1')
          .update(
            [
              row.firstName,
              row.lastName,
              row.street,
              row.zip,
              row.email,
              row.phone,
            ]
              .filter(Boolean)
              .join('|')
          )
          .digest('hex')
          .slice(0, 16);

      let addressPointId: number | null = null;
      if (row.street || (row.latitude != null && row.longitude != null)) {
        const street =
          (row.street || '').toUpperCase().trim() ||
          `GEO:${row.latitude},${row.longitude}`;
        await sql.execute(
          `INSERT INTO address_points
            (organization_id, street_normalized, unit, city, state, zip, latitude, longitude, geocode_confidence, source_address)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             latitude = COALESCE(VALUES(latitude), latitude),
             longitude = COALESCE(VALUES(longitude), longitude),
             updated_at = CURRENT_TIMESTAMP`,
          [
            organizationId,
            street,
            row.unit || null,
            row.city || null,
            row.state || null,
            row.zip || null,
            row.latitude ?? null,
            row.longitude ?? null,
            row.latitude != null ? 0.9 : null,
            [row.street, row.city, row.state, row.zip].filter(Boolean).join(', '),
          ]
        );
        const [addrRows] = await sql.execute(
          `SELECT id FROM address_points
           WHERE organization_id <=> ? AND street_normalized = ? AND IFNULL(unit,'') = ? AND IFNULL(zip,'') = ?
           LIMIT 1`,
          [organizationId, street, row.unit || '', row.zip || '']
        );
        addressPointId = Number((addrRows as RowDataPacket[])[0]?.id) || null;
      }

      const ageBucket = row.ageBucket || ageBucketFromYears(row.ageYears ?? null);
      await sql.execute(
        `INSERT INTO person_records (
          organization_id, cluster_key, address_point_id,
          first_name, last_name, full_name_normalized, email, phone,
          birthdate, age_years, age_bucket, party, gender, voter_status,
          district, city, state, zip, owner_occupied, property_type,
          match_confidence, field_provenance, source_row_ids, latitude, longitude
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          address_point_id = COALESCE(VALUES(address_point_id), address_point_id),
          first_name = VALUES(first_name),
          last_name = VALUES(last_name),
          full_name_normalized = VALUES(full_name_normalized),
          email = VALUES(email),
          phone = VALUES(phone),
          birthdate = VALUES(birthdate),
          age_years = VALUES(age_years),
          age_bucket = VALUES(age_bucket),
          party = VALUES(party),
          gender = VALUES(gender),
          voter_status = VALUES(voter_status),
          district = VALUES(district),
          city = VALUES(city),
          state = VALUES(state),
          zip = VALUES(zip),
          owner_occupied = VALUES(owner_occupied),
          property_type = VALUES(property_type),
          match_confidence = VALUES(match_confidence),
          field_provenance = VALUES(field_provenance),
          source_row_ids = VALUES(source_row_ids),
          latitude = VALUES(latitude),
          longitude = VALUES(longitude),
          updated_at = CURRENT_TIMESTAMP`,
        [
          organizationId,
          clusterKey,
          addressPointId,
          row.firstName || null,
          row.lastName || null,
          `${row.firstName || ''} ${row.lastName || ''}`.trim().toUpperCase() || null,
          row.email || null,
          row.phone || null,
          row.birthdate || null,
          row.ageYears ?? null,
          ageBucket,
          row.party || null,
          row.gender || null,
          row.voterStatus || null,
          row.district || null,
          row.city || null,
          row.state || null,
          row.zip || null,
          row.ownerOccupied == null ? null : row.ownerOccupied ? 1 : 0,
          row.propertyType || null,
          row.matchConfidence ?? 0.9,
          JSON.stringify(row.fieldProvenance || { source: 'upload' }),
          JSON.stringify(row.sourceRowIds || []),
          row.latitude ?? null,
          row.longitude ?? null,
        ]
      );
      upserted++;
    }

    return { upserted };
  }
}

/** Map API shape with effective (door-confirmed) party for coloring. */
export function toMapPerson(row: PersonRecordRow) {
  const effectiveParty = (row.canvass_party || row.party || '').trim() || null;
  // P2 propensity — recomputed from Map prior + engagement (not a stored ballistic score).
  // Orchestrator must use propensity.blended, never propensity.priorP0.
  const events = eventsFromPersonCanvass(row);
  const propensity = resolvePropensityForOrchestrator(
    {
      party: row.party,
      canvassParty: row.canvass_party,
      voterStatus: row.voter_status,
      district: row.district,
      zip: row.zip,
      state: row.state,
    },
    0,
    events
  );

  return {
    id: row.id,
    clusterKey: row.cluster_key,
    firstName: row.first_name,
    lastName: row.last_name,
    label: [row.first_name, row.last_name].filter(Boolean).join(' ') || 'Household',
    addressLine: [row.city, row.state, row.zip].filter(Boolean).join(', '),
    email: row.email,
    phone: row.phone,
    party: row.party,
    effectiveParty,
    ageBucket: row.age_bucket,
    voterStatus: row.voter_status,
    district: row.district,
    zip: row.zip,
    city: row.city,
    state: row.state,
    ownerOccupied: row.owner_occupied == null ? null : Boolean(row.owner_occupied),
    matchConfidence: Number(row.match_confidence),
    canvassStatus: row.canvass_status || 'not_contacted',
    canvassParty: row.canvass_party,
    canvassNotes: row.canvass_notes,
    lat: Number(row.latitude),
    lng: Number(row.longitude),
    /** Propensity read (P2 blend). Prefer `blended` for decisions. */
    propensity: {
      blended: propensity.blended,
      priorWeight: propensity.priorWeight,
      phase: propensity.phase,
      confidence: propensity.confidence ?? 0,
      posteriorQ: propensity.posteriorQ ?? null,
      tier: propensity.tier ?? 'warm',
      evidenceE: propensity.evidenceE ?? 0,
      // Audit-only prior snapshot — not for targeting
      priorP0: propensity.prior.p0,
      priorFormula: propensity.prior.formulaVersion,
    },
  };
}
