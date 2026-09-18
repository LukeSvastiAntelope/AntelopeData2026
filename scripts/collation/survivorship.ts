/**
 * Survivorship — golden record: best value per field with provenance.
 * Prefer non-empty values; prefer first-party / voter over consumer over property for identity;
 * prefer property for owner_occupied / property_type.
 */

import { createHash } from 'crypto';
import type { FieldProvenance, StandardizedRow, UnifiedPerson } from './types';
import { clusterConfidence } from './cluster';
import type { ScoredPair } from './types';

const SOURCE_RANK: Record<string, number> = {
  canvass: 5,
  survey: 5,
  voter: 4,
  consumer: 3,
  property: 2,
  mock: 1,
  other: 1,
};

function rank(row: StandardizedRow): number {
  return SOURCE_RANK[row.sourceKind] ?? 1;
}

function pickBestString(
  members: StandardizedRow[],
  getter: (r: StandardizedRow) => string,
  field: string,
  preferredKinds?: string[]
): FieldProvenance {
  const ranked = [...members].sort((a, b) => {
    const aVal = getter(a);
    const bVal = getter(b);
    if (!!aVal !== !!bVal) return aVal ? -1 : 1;
    if (preferredKinds?.length) {
      const ap = preferredKinds.includes(a.sourceKind) ? 1 : 0;
      const bp = preferredKinds.includes(b.sourceKind) ? 1 : 0;
      if (ap !== bp) return bp - ap;
    }
    return rank(b) - rank(a);
  });
  const winner = ranked.find((r) => getter(r)) || ranked[0];
  const value = winner ? getter(winner) : '';
  return {
    value: value || null,
    source: winner?.sourceName || 'unknown',
    confidence: value ? Math.min(0.99, 0.55 + rank(winner) * 0.08) : 0,
  };
}

function pickBestNumber(
  members: StandardizedRow[],
  getter: (r: StandardizedRow) => number | null,
  preferredKinds?: string[]
): FieldProvenance {
  const ranked = [...members].sort((a, b) => {
    const aVal = getter(a);
    const bVal = getter(b);
    if ((aVal != null) !== (bVal != null)) return aVal != null ? -1 : 1;
    if (preferredKinds?.length) {
      const ap = preferredKinds.includes(a.sourceKind) ? 1 : 0;
      const bp = preferredKinds.includes(b.sourceKind) ? 1 : 0;
      if (ap !== bp) return bp - ap;
    }
    return rank(b) - rank(a);
  });
  const winner = ranked.find((r) => getter(r) != null) || ranked[0];
  const value = winner ? getter(winner) : null;
  return {
    value,
    source: winner?.sourceName || 'unknown',
    confidence: value != null ? 0.85 : 0,
  };
}

function pickBestBool(
  members: StandardizedRow[],
  getter: (r: StandardizedRow) => boolean | null,
  preferredKinds?: string[]
): FieldProvenance {
  const ranked = [...members].sort((a, b) => {
    const aVal = getter(a);
    const bVal = getter(b);
    if ((aVal != null) !== (bVal != null)) return aVal != null ? -1 : 1;
    if (preferredKinds?.length) {
      const ap = preferredKinds.includes(a.sourceKind) ? 1 : 0;
      const bp = preferredKinds.includes(b.sourceKind) ? 1 : 0;
      if (ap !== bp) return bp - ap;
    }
    return rank(b) - rank(a);
  });
  const winner = ranked.find((r) => getter(r) != null) || ranked[0];
  const value = winner ? getter(winner) : null;
  return {
    value,
    source: winner?.sourceName || 'unknown',
    confidence: value != null ? 0.9 : 0,
  };
}

export function makeClusterKey(members: StandardizedRow[]): string {
  const basis = members
    .map((m) => `${m.sourceName}:${m.sourceRowKey}`)
    .sort()
    .join('|');
  return createHash('sha1').update(basis).digest('hex').slice(0, 16);
}

export function surviveCluster(
  members: StandardizedRow[],
  memberIdxs: number[],
  pairs: ScoredPair[]
): UnifiedPerson {
  const firstName = pickBestString(members, (r) => r.firstName, 'first_name', [
    'canvass',
    'survey',
    'voter',
  ]);
  const lastName = pickBestString(members, (r) => r.lastName, 'last_name', [
    'canvass',
    'survey',
    'voter',
  ]);
  const email = pickBestString(members, (r) => r.email, 'email', ['survey', 'consumer', 'voter']);
  const phone = pickBestString(members, (r) => r.phone, 'phone', ['canvass', 'consumer', 'voter']);
  const street = pickBestString(members, (r) => r.street, 'street', ['property', 'voter', 'canvass']);
  const unit = pickBestString(members, (r) => r.unit, 'unit', ['property', 'voter']);
  const city = pickBestString(members, (r) => r.city, 'city', ['property', 'voter']);
  const state = pickBestString(members, (r) => r.state, 'state', ['property', 'voter']);
  const zip = pickBestString(members, (r) => r.zip, 'zip', ['property', 'voter']);
  const party = pickBestString(members, (r) => r.party, 'party', ['voter']);
  const gender = pickBestString(members, (r) => r.gender, 'gender', ['voter', 'consumer']);
  const voterStatus = pickBestString(members, (r) => r.voterStatus, 'voter_status', ['voter']);
  const district = pickBestString(members, (r) => r.district, 'district', ['voter', 'property']);
  const propertyType = pickBestString(members, (r) => r.propertyType, 'property_type', [
    'property',
  ]);
  const ownerOccupied = pickBestBool(members, (r) => r.ownerOccupied, ['property']);
  const ageYears = pickBestNumber(members, (r) => r.ageYears, ['voter', 'consumer', 'survey']);
  const birthdate = pickBestString(members, (r) => r.birthdate || '', 'birthdate', [
    'voter',
    'consumer',
  ]);
  const latitude = pickBestNumber(members, (r) => r.latitude, ['property', 'canvass', 'voter']);
  const longitude = pickBestNumber(members, (r) => r.longitude, ['property', 'canvass', 'voter']);
  const ageBucket = pickBestString(members, (r) => r.ageBucket, 'age_bucket', [
    'voter',
    'consumer',
  ]);

  const fullNameNormalized = [String(firstName.value || ''), String(lastName.value || '')]
    .filter(Boolean)
    .join(' ')
    .trim();

  const fieldProvenance: Record<string, FieldProvenance> = {
    first_name: firstName,
    last_name: lastName,
    email,
    phone,
    street,
    unit,
    city,
    state,
    zip,
    party,
    gender,
    voter_status: voterStatus,
    district,
    property_type: propertyType,
    owner_occupied: ownerOccupied,
    age_years: ageYears,
    birthdate,
    age_bucket: ageBucket,
    latitude,
    longitude,
  };

  return {
    clusterKey: makeClusterKey(members),
    firstName: String(firstName.value || ''),
    lastName: String(lastName.value || ''),
    fullNameNormalized,
    email: String(email.value || ''),
    phone: String(phone.value || ''),
    birthdate: birthdate.value ? String(birthdate.value) : null,
    ageYears: typeof ageYears.value === 'number' ? ageYears.value : null,
    ageBucket: (ageBucket.value as UnifiedPerson['ageBucket']) || '',
    party: String(party.value || ''),
    gender: String(gender.value || ''),
    voterStatus: String(voterStatus.value || ''),
    district: String(district.value || ''),
    city: String(city.value || ''),
    state: String(state.value || ''),
    zip: String(zip.value || ''),
    street: String(street.value || ''),
    unit: String(unit.value || ''),
    ownerOccupied:
      typeof ownerOccupied.value === 'boolean' ? ownerOccupied.value : null,
    propertyType: String(propertyType.value || ''),
    latitude: typeof latitude.value === 'number' ? latitude.value : null,
    longitude: typeof longitude.value === 'number' ? longitude.value : null,
    matchConfidence: clusterConfidence(memberIdxs, pairs),
    fieldProvenance,
    sourceRowKeys: members.map((m) => `${m.sourceName}:${m.sourceRowKey}`),
    sourceNames: Array.from(new Set(members.map((m) => m.sourceName))),
  };
}
