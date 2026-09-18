/**
 * Load MOCK_district_records.csv (D1 output schema) straight into MySQL
 * so D2/D3 map work can run without real multi-source collation.
 *
 * Usage:
 *   npx tsx --tsconfig tsconfig.json -r dotenv/config scripts/collation/load-mock.ts \
 *     --file fixtures/MOCK_district_records.csv --org 1
 */

import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import { parse } from 'csv-parse/sync';
import type { FieldProvenance, UnifiedPerson } from './types';
import { ageBucketFromYears } from './standardize';
import { writeUnifiedBatch } from './write-mysql';

require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

function arg(name: string, fallback = ''): string {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

function prov(value: string | number | boolean | null, source = 'mock'): FieldProvenance {
  return { value, source, confidence: value == null || value === '' ? 0 : 0.95 };
}

function rowToPerson(raw: Record<string, string>, idx: number): UnifiedPerson {
  const ageYears = raw.age_years ? Number(raw.age_years) : null;
  const owner =
    raw.owner_occupied === '' || raw.owner_occupied == null
      ? null
      : ['1', 'true', 'yes', 'y'].includes(String(raw.owner_occupied).toLowerCase());
  const lat = raw.latitude ? Number(raw.latitude) : null;
  const lng = raw.longitude ? Number(raw.longitude) : null;
  const clusterKey = raw.cluster_key || `mock_${String(idx + 1).padStart(4, '0')}`;
  const firstName = raw.first_name || '';
  const lastName = raw.last_name || '';
  const ageBucket =
    (raw.age_bucket as UnifiedPerson['ageBucket']) || ageBucketFromYears(ageYears);

  const fieldProvenance: Record<string, FieldProvenance> = {
    first_name: prov(firstName),
    last_name: prov(lastName),
    email: prov(raw.email || null),
    phone: prov(raw.phone || null),
    street: prov(raw.street || null),
    city: prov(raw.city || null),
    state: prov(raw.state || null),
    zip: prov(raw.zip || null),
    party: prov(raw.party || null),
    voter_status: prov(raw.voter_status || null),
    district: prov(raw.district || null),
    age_years: prov(ageYears),
    age_bucket: prov(ageBucket || null),
    owner_occupied: prov(owner),
    property_type: prov(raw.property_type || null),
    latitude: prov(lat),
    longitude: prov(lng),
  };

  return {
    clusterKey,
    firstName,
    lastName,
    fullNameNormalized: `${firstName} ${lastName}`.trim().toUpperCase(),
    email: raw.email || '',
    phone: (raw.phone || '').replace(/\D/g, ''),
    birthdate: raw.birthdate || null,
    ageYears,
    ageBucket,
    party: raw.party || '',
    gender: raw.gender || '',
    voterStatus: raw.voter_status || '',
    district: raw.district || '',
    city: raw.city || '',
    state: raw.state || '',
    zip: raw.zip || '',
    street: raw.street || '',
    unit: raw.unit || '',
    ownerOccupied: owner,
    propertyType: raw.property_type || '',
    latitude: lat,
    longitude: lng,
    matchConfidence: raw.match_confidence ? Number(raw.match_confidence) : 0.9,
    fieldProvenance,
    sourceRowKeys: (raw.source_row_ids || `mock:${idx + 1}`).split('|').filter(Boolean),
    sourceNames: ['mock'],
  };
}

async function main() {
  const file = arg('file', 'fixtures/MOCK_district_records.csv');
  const orgIdRaw = arg('org', '1');
  const orgId = orgIdRaw ? Number(orgIdRaw) : null;
  const abs = path.resolve(file);
  const rows = parse(fs.readFileSync(abs, 'utf8'), {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, string>[];

  console.log(`Loading ${rows.length} mock unified records from ${abs}`);

  const people = rows.map((r, i) => rowToPerson(r, i));
  const sourceRowsByCluster = new Map();

  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: parseInt(process.env.MYSQL_PORT || '3306', 10),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
  });

  try {
    const result = await writeUnifiedBatch(conn, orgId, people, sourceRowsByCluster);
    console.log(`Loaded ${result.people} person_records / ${result.addresses} address_points`);
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
