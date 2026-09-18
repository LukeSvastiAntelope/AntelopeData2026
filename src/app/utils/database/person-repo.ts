/**
 * Person records serving layer (D1 output). Map filters (D2) read through this.
 */

import { openSql } from '@/app/utils/database/db';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';

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
  minConfidence?: number;
  bbox?: { west: number; south: number; east: number; north: number };
  limit?: number;
};

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
      where.push(`party IN (${filters.party.map(() => '?').join(',')})`);
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

  static async countByOrg(organizationId: number | null): Promise<number> {
    const sql = await openSql();
    const [rows] = await sql.execute(
      `SELECT COUNT(*) AS c FROM person_records WHERE organization_id <=> ?`,
      [organizationId]
    );
    return Number((rows as RowDataPacket[])[0]?.c || 0);
  }
}
