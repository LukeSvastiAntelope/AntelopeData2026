/**
 * Write unified persons + address points + source rows into MySQL (idempotent upsert).
 */

import type { Connection } from 'mysql2/promise';
import type { StandardizedRow, UnifiedPerson } from './types';

export async function upsertAddressPoint(
  conn: Connection,
  orgId: number | null,
  person: UnifiedPerson
): Promise<number | null> {
  if (!person.street && person.latitude == null) return null;
  const street = person.street || `GEO:${person.latitude},${person.longitude}`;
  const unit = person.unit || '';
  const zip = person.zip || '';

  await conn.execute(
    `INSERT INTO address_points
      (organization_id, street_normalized, unit, city, state, zip, latitude, longitude, geocode_confidence, source_address)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       city = COALESCE(VALUES(city), city),
       state = COALESCE(VALUES(state), state),
       latitude = COALESCE(VALUES(latitude), latitude),
       longitude = COALESCE(VALUES(longitude), longitude),
       geocode_confidence = COALESCE(VALUES(geocode_confidence), geocode_confidence),
       updated_at = CURRENT_TIMESTAMP`,
    [
      orgId,
      street,
      unit || null,
      person.city || null,
      person.state || null,
      zip || null,
      person.latitude,
      person.longitude,
      person.latitude != null ? 0.85 : null,
      [person.street, person.city, person.state, person.zip].filter(Boolean).join(', '),
    ]
  );

  const [rows] = await conn.execute(
    `SELECT id FROM address_points
     WHERE organization_id <=> ? AND street_normalized = ? AND IFNULL(unit,'') = ? AND IFNULL(zip,'') = ?
     LIMIT 1`,
    [orgId, street, unit, zip]
  );
  const id = Array.isArray(rows) && rows[0] ? Number((rows as any)[0].id) : null;
  return Number.isFinite(id) ? id : null;
}

export async function upsertPersonRecord(
  conn: Connection,
  orgId: number | null,
  person: UnifiedPerson,
  addressPointId: number | null
): Promise<number> {
  await conn.execute(
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
      orgId,
      person.clusterKey,
      addressPointId,
      person.firstName || null,
      person.lastName || null,
      person.fullNameNormalized || null,
      person.email || null,
      person.phone || null,
      person.birthdate,
      person.ageYears,
      person.ageBucket || null,
      person.party || null,
      person.gender || null,
      person.voterStatus || null,
      person.district || null,
      person.city || null,
      person.state || null,
      person.zip || null,
      person.ownerOccupied,
      person.propertyType || null,
      person.matchConfidence,
      JSON.stringify(person.fieldProvenance),
      JSON.stringify(person.sourceRowKeys),
      person.latitude,
      person.longitude,
    ]
  );

  const [rows] = await conn.execute(
    `SELECT id FROM person_records WHERE organization_id <=> ? AND cluster_key = ? LIMIT 1`,
    [orgId, person.clusterKey]
  );
  return Number((rows as any)[0].id);
}

export async function upsertSourceRow(
  conn: Connection,
  orgId: number | null,
  row: StandardizedRow,
  personRecordId: number | null
): Promise<void> {
  await conn.execute(
    `INSERT INTO person_source_rows
      (organization_id, source_name, source_row_key, person_record_id, payload, block_key)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       person_record_id = COALESCE(VALUES(person_record_id), person_record_id),
       payload = VALUES(payload),
       block_key = VALUES(block_key),
       updated_at = CURRENT_TIMESTAMP`,
    [
      orgId,
      row.sourceName,
      row.sourceRowKey,
      personRecordId,
      JSON.stringify(row),
      row.blockKey,
    ]
  );
}

export async function writeUnifiedBatch(
  conn: Connection,
  orgId: number | null,
  people: UnifiedPerson[],
  sourceRowsByCluster: Map<string, StandardizedRow[]>
): Promise<{ people: number; addresses: number }> {
  let addressCount = 0;
  for (const person of people) {
    const addressId = await upsertAddressPoint(conn, orgId, person);
    if (addressId) addressCount++;
    const personId = await upsertPersonRecord(conn, orgId, person, addressId);
    const sources = sourceRowsByCluster.get(person.clusterKey) || [];
    for (const src of sources) {
      await upsertSourceRow(conn, orgId, src, personId);
    }
  }
  return { people: people.length, addresses: addressCount };
}
