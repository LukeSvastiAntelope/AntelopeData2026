/**
 * FM3 merge helpers — unify two person_records conservatively.
 * Survivor = lower id. Loser is deleted after FK reassignment.
 * Survivorship: prefer non-empty; prefer higher prior match_confidence on ties.
 */

import type { PoolConnection } from 'mysql2/promise';
import { createHash } from 'crypto';

export type PersonMergeRow = {
  id: number;
  organization_id: number;
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
};

function pickString(
  a: string | null | undefined,
  b: string | null | undefined,
  aConf: number,
  bConf: number
): { value: string | null; source: 'a' | 'b' | 'none' } {
  const A = (a || '').trim();
  const B = (b || '').trim();
  if (A && !B) return { value: A, source: 'a' };
  if (B && !A) return { value: B, source: 'b' };
  if (!A && !B) return { value: null, source: 'none' };
  if (A === B) return { value: A, source: 'a' };
  return aConf >= bConf ? { value: A, source: 'a' } : { value: B, source: 'b' };
}

function pickNum(
  a: number | null | undefined,
  b: number | null | undefined,
  aConf: number,
  bConf: number
): number | null {
  if (a != null && b == null) return a;
  if (b != null && a == null) return b;
  if (a == null && b == null) return null;
  return aConf >= bConf ? a! : b!;
}

function parseJsonArray(raw: unknown): string[] {
  try {
    if (raw == null) return [];
    if (Array.isArray(raw)) return raw.map(String);
    if (typeof raw === 'string') {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    }
    return [];
  } catch {
    return [];
  }
}

export function buildSurvivorship(
  survivor: PersonMergeRow,
  loser: PersonMergeRow,
  pairScore: number
): {
  fields: Partial<PersonMergeRow>;
  provenance: Record<string, { value: unknown; from: 'survivor' | 'loser' | 'both' }>;
  clusterKey: string;
  matchConfidence: number;
  sourceRowIds: string[];
} {
  const aConf = Number(survivor.match_confidence) || 0;
  const bConf = Number(loser.match_confidence) || 0;

  const first = pickString(survivor.first_name, loser.first_name, aConf, bConf);
  const last = pickString(survivor.last_name, loser.last_name, aConf, bConf);
  const email = pickString(survivor.email, loser.email, aConf, bConf);
  const phone = pickString(survivor.phone, loser.phone, aConf, bConf);
  const party = pickString(survivor.party, loser.party, aConf, bConf);
  const gender = pickString(survivor.gender, loser.gender, aConf, bConf);
  const voterStatus = pickString(survivor.voter_status, loser.voter_status, aConf, bConf);
  const district = pickString(survivor.district, loser.district, aConf, bConf);
  const city = pickString(survivor.city, loser.city, aConf, bConf);
  const state = pickString(survivor.state, loser.state, aConf, bConf);
  const zip = pickString(survivor.zip, loser.zip, aConf, bConf);
  const ageBucket = pickString(survivor.age_bucket, loser.age_bucket, aConf, bConf);
  const propertyType = pickString(survivor.property_type, loser.property_type, aConf, bConf);
  const birthdate = pickString(
    survivor.birthdate ? String(survivor.birthdate).slice(0, 10) : null,
    loser.birthdate ? String(loser.birthdate).slice(0, 10) : null,
    aConf,
    bConf
  );

  const ageYears = pickNum(survivor.age_years, loser.age_years, aConf, bConf);
  const latitude = pickNum(survivor.latitude, loser.latitude, aConf, bConf);
  const longitude = pickNum(survivor.longitude, loser.longitude, aConf, bConf);
  const ownerOccupied = pickNum(
    survivor.owner_occupied,
    loser.owner_occupied,
    aConf,
    bConf
  );

  const fullName =
    [first.value, last.value].filter(Boolean).join(' ').trim() ||
    pickString(survivor.full_name_normalized, loser.full_name_normalized, aConf, bConf)
      .value;

  const addressPointId =
    survivor.address_point_id ?? loser.address_point_id ?? null;

  const clusterKey = createHash('sha1')
    .update([survivor.cluster_key, loser.cluster_key].sort().join('|'))
    .digest('hex')
    .slice(0, 16);

  const sourceRowIds = Array.from(
    new Set([
      ...parseJsonArray(survivor.source_row_ids),
      ...parseJsonArray(loser.source_row_ids),
    ])
  );

  const matchConfidence = Math.min(
    0.999,
    Math.max(pairScore, aConf, bConf, 0.9)
  );

  const provenance: Record<string, { value: unknown; from: 'survivor' | 'loser' | 'both' }> = {
    first_name: {
      value: first.value,
      from: first.source === 'a' ? 'survivor' : first.source === 'b' ? 'loser' : 'both',
    },
    last_name: {
      value: last.value,
      from: last.source === 'a' ? 'survivor' : last.source === 'b' ? 'loser' : 'both',
    },
    email: {
      value: email.value,
      from: email.source === 'a' ? 'survivor' : email.source === 'b' ? 'loser' : 'both',
    },
    phone: {
      value: phone.value,
      from: phone.source === 'a' ? 'survivor' : phone.source === 'b' ? 'loser' : 'both',
    },
    merge: { value: { survivorId: survivor.id, loserId: loser.id, pairScore }, from: 'both' },
  };

  return {
    clusterKey,
    matchConfidence,
    sourceRowIds,
    provenance,
    fields: {
      cluster_key: clusterKey,
      address_point_id: addressPointId,
      first_name: first.value,
      last_name: last.value,
      full_name_normalized: fullName,
      email: email.value,
      phone: phone.value,
      birthdate: birthdate.value,
      age_years: ageYears,
      age_bucket: ageBucket.value,
      party: party.value,
      gender: gender.value,
      voter_status: voterStatus.value,
      district: district.value,
      city: city.value,
      state: state.value,
      zip: zip.value,
      owner_occupied: ownerOccupied,
      property_type: propertyType.value,
      latitude,
      longitude,
      match_confidence: matchConfidence,
    },
  };
}

export async function autoMergePersons(
  conn: PoolConnection,
  organizationId: number,
  personAId: number,
  personBId: number,
  pairScore: number
): Promise<{ survivorId: number; loserId: number; clusterKey: string }> {
  const leftId = Math.min(personAId, personBId);
  const rightId = Math.max(personAId, personBId);

  const [rows] = await conn.execute(
    `SELECT * FROM person_records
     WHERE organization_id = ? AND id IN (?, ?)
     FOR UPDATE`,
    [organizationId, leftId, rightId]
  );
  const people = rows as PersonMergeRow[];
  if (people.length !== 2) {
    throw new Error(`auto-merge requires two live persons; found ${people.length}`);
  }
  const survivor = people.find((p) => p.id === leftId)!;
  const loser = people.find((p) => p.id === rightId)!;

  const merged = buildSurvivorship(survivor, loser, pairScore);
  const f = merged.fields;

  // If cluster_key collides with another row, keep survivor id key with suffix
  let clusterKey = merged.clusterKey;
  const [clash] = await conn.execute(
    `SELECT id FROM person_records
     WHERE organization_id = ? AND cluster_key = ? AND id NOT IN (?, ?) LIMIT 1`,
    [organizationId, clusterKey, survivor.id, loser.id]
  );
  if ((clash as any[]).length) {
    clusterKey = `${clusterKey}${String(survivor.id).slice(-2)}`;
  }

  await conn.execute(
    `UPDATE person_records SET
       cluster_key = ?,
       address_point_id = COALESCE(?, address_point_id),
       first_name = ?, last_name = ?, full_name_normalized = ?,
       email = ?, phone = ?, birthdate = ?, age_years = ?, age_bucket = ?,
       party = ?, gender = ?, voter_status = ?, district = ?,
       city = ?, state = ?, zip = ?, owner_occupied = ?, property_type = ?,
       latitude = ?, longitude = ?,
       match_confidence = ?,
       field_provenance = ?,
       source_row_ids = ?,
       updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND organization_id = ?`,
    [
      clusterKey,
      f.address_point_id ?? null,
      f.first_name ?? null,
      f.last_name ?? null,
      f.full_name_normalized ?? null,
      f.email ?? null,
      f.phone ?? null,
      f.birthdate ?? null,
      f.age_years ?? null,
      f.age_bucket ?? null,
      f.party ?? null,
      f.gender ?? null,
      f.voter_status ?? null,
      f.district ?? null,
      f.city ?? null,
      f.state ?? null,
      f.zip ?? null,
      f.owner_occupied ?? null,
      f.property_type ?? null,
      f.latitude ?? null,
      f.longitude ?? null,
      merged.matchConfidence,
      JSON.stringify(merged.provenance),
      JSON.stringify(merged.sourceRowIds),
      survivor.id,
      organizationId,
    ]
  );

  // Reassign source rows + soft FKs from loser → survivor
  await conn.execute(
    `UPDATE person_source_rows SET person_record_id = ?
     WHERE person_record_id = ? AND organization_id <=> ?`,
    [survivor.id, loser.id, organizationId]
  );
  await conn.execute(
    `UPDATE contact_suppression SET person_record_id = ?
     WHERE person_record_id = ? AND organization_id = ?`,
    [survivor.id, loser.id, organizationId]
  );
  await conn.execute(
    `UPDATE canvass_contacts SET person_record_id = ?
     WHERE person_record_id = ? AND organization_id = ?`,
    [survivor.id, loser.id, organizationId]
  );
  await conn.execute(
    `UPDATE turf_addresses SET person_record_id = ?
     WHERE person_record_id = ?`,
    [survivor.id, loser.id]
  );
  await conn.execute(
    `UPDATE turf_stop_outcomes SET person_record_id = ?
     WHERE person_record_id = ? AND organization_id = ?`,
    [survivor.id, loser.id, organizationId]
  );

  // voter_propensity PK = person_record_id — keep survivor, drop loser if both exist
  const [propLoser] = await conn.execute(
    `SELECT person_record_id FROM voter_propensity WHERE person_record_id = ? LIMIT 1`,
    [loser.id]
  );
  const [propSurv] = await conn.execute(
    `SELECT person_record_id FROM voter_propensity WHERE person_record_id = ? LIMIT 1`,
    [survivor.id]
  );
  if ((propLoser as any[]).length) {
    if ((propSurv as any[]).length) {
      await conn.execute(`DELETE FROM voter_propensity WHERE person_record_id = ?`, [
        loser.id,
      ]);
    } else {
      await conn.execute(
        `UPDATE voter_propensity SET person_record_id = ? WHERE person_record_id = ?`,
        [survivor.id, loser.id]
      );
    }
  }

  // Clear match-candidate FKs that reference loser before delete
  await conn.execute(
    `UPDATE person_match_candidates
     SET decision = 'auto_merge'
     WHERE organization_id = ?
       AND decision = 'pending'
       AND (left_person_id = ? OR right_person_id = ? OR left_person_id = ? OR right_person_id = ?)`,
    [organizationId, survivor.id, survivor.id, loser.id, loser.id]
  );

  await conn.execute(`DELETE FROM person_records WHERE id = ? AND organization_id = ?`, [
    loser.id,
    organizationId,
  ]);

  return { survivorId: survivor.id, loserId: loser.id, clusterKey };
}
