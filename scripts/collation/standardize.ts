/**
 * Standardize source rows into one schema (names, addresses, emails, phones).
 * CASS-style address cleanup is approximated (uppercase, street suffix expand,
 * ZIP5) — swap in a real CASS provider later without changing the pipeline.
 */

import type { AgeBucket, SourceKind, StandardizedRow } from './types';

const STREET_SUFFIX: Record<string, string> = {
  STREET: 'ST',
  STR: 'ST',
  AVENUE: 'AVE',
  AVE: 'AVE',
  BOULEVARD: 'BLVD',
  BLVD: 'BLVD',
  ROAD: 'RD',
  RD: 'RD',
  DRIVE: 'DR',
  DR: 'DR',
  LANE: 'LN',
  LN: 'LN',
  COURT: 'CT',
  CT: 'CT',
  PLACE: 'PL',
  PL: 'PL',
  CIRCLE: 'CIR',
  CIR: 'CIR',
  HIGHWAY: 'HWY',
  HWY: 'HWY',
  TERRACE: 'TER',
  TER: 'TER',
};

function pick(raw: Record<string, string>, keys: string[]): string {
  for (const k of keys) {
    const hit = Object.keys(raw).find((rk) => rk.toLowerCase() === k.toLowerCase());
    if (hit && String(raw[hit] ?? '').trim()) return String(raw[hit]).trim();
  }
  return '';
}

export function soundex(input: string): string {
  const s = input.toUpperCase().replace(/[^A-Z]/g, '');
  if (!s) return '';
  const map: Record<string, string> = {
    B: '1', F: '1', P: '1', V: '1',
    C: '2', G: '2', J: '2', K: '2', Q: '2', S: '2', X: '2', Z: '2',
    D: '3', T: '3',
    L: '4',
    M: '5', N: '5',
    R: '6',
  };
  let out = s[0];
  let prev = map[s[0]] || '';
  for (let i = 1; i < s.length && out.length < 4; i++) {
    const code = map[s[i]] || '';
    if (code && code !== prev) out += code;
    if (code) prev = code;
    if (!code && !'HW'.includes(s[i])) prev = '';
  }
  return (out + '000').slice(0, 4);
}

export function normalizeName(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeEmail(value: string): string {
  return value.toLowerCase().trim();
}

export function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  if (digits.length === 10) return digits;
  return digits;
}

export function normalizeZip(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits.slice(0, 5);
}

export function normalizeState(value: string): string {
  const v = value.trim().toUpperCase();
  if (v.length === 2) return v;
  const map: Record<string, string> = {
    ALABAMA: 'AL', ALASKA: 'AK', ARIZONA: 'AZ', ARKANSAS: 'AR', CALIFORNIA: 'CA',
    COLORADO: 'CO', CONNECTICUT: 'CT', DELAWARE: 'DE', FLORIDA: 'FL', GEORGIA: 'GA',
    HAWAII: 'HI', IDAHO: 'ID', ILLINOIS: 'IL', INDIANA: 'IN', IOWA: 'IA',
    KANSAS: 'KS', KENTUCKY: 'KY', LOUISIANA: 'LA', MAINE: 'ME', MARYLAND: 'MD',
    MASSACHUSETTS: 'MA', MICHIGAN: 'MI', MINNESOTA: 'MN', MISSISSIPPI: 'MS',
    MISSOURI: 'MO', MONTANA: 'MT', NEBRASKA: 'NE', NEVADA: 'NV', 'NEW HAMPSHIRE': 'NH',
    'NEW JERSEY': 'NJ', 'NEW MEXICO': 'NM', 'NEW YORK': 'NY', 'NORTH CAROLINA': 'NC',
    'NORTH DAKOTA': 'ND', OHIO: 'OH', OKLAHOMA: 'OK', OREGON: 'OR', PENNSYLVANIA: 'PA',
    'RHODE ISLAND': 'RI', 'SOUTH CAROLINA': 'SC', 'SOUTH DAKOTA': 'SD', TENNESSEE: 'TN',
    TEXAS: 'TX', UTAH: 'UT', VERMONT: 'VT', VIRGINIA: 'VA', WASHINGTON: 'WA',
    'WEST VIRGINIA': 'WV', WISCONSIN: 'WI', WYOMING: 'WY', 'DISTRICT OF COLUMBIA': 'DC',
  };
  return map[v] || v.slice(0, 2);
}

export function normalizeStreet(value: string): string {
  let s = value.toUpperCase().replace(/[.,#]/g, ' ').replace(/\s+/g, ' ').trim();
  s = s
    .replace(/\bAPT\b/g, '')
    .replace(/\bAPARTMENT\b/g, '')
    .replace(/\bUNIT\b/g, '')
    .replace(/\bSTE\b/g, '')
    .replace(/\bSUITE\b/g, '');
  const parts = s.split(' ').filter(Boolean);
  if (parts.length) {
    const last = parts[parts.length - 1];
    if (STREET_SUFFIX[last]) parts[parts.length - 1] = STREET_SUFFIX[last];
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

export function ageBucketFromYears(age: number | null): AgeBucket {
  if (age == null || !Number.isFinite(age)) return '';
  if (age < 25) return '18-24';
  if (age < 35) return '25-34';
  if (age < 45) return '35-44';
  if (age < 55) return '45-54';
  if (age < 65) return '55-64';
  return '65+';
}

function parseAge(raw: Record<string, string>): { years: number | null; birthdate: string | null } {
  const ageStr = pick(raw, ['age', 'age_years', 'Age', 'Voters_Age']);
  if (ageStr && /^\d{1,3}$/.test(ageStr)) {
    return { years: Number(ageStr), birthdate: null };
  }
  const dob = pick(raw, ['birthdate', 'dob', 'date_of_birth', 'BirthDate', 'Voters_BirthDate']);
  if (dob) {
    const d = new Date(dob);
    if (!Number.isNaN(d.getTime())) {
      const years = Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000));
      return { years, birthdate: d.toISOString().slice(0, 10) };
    }
  }
  return { years: null, birthdate: null };
}

function normalizeParty(value: string): string {
  const v = value.toUpperCase().trim();
  const map: Record<string, string> = {
    D: 'Democrat', DEM: 'Democrat', DEMOCRAT: 'Democrat', DEMOCRATIC: 'Democrat',
    R: 'Republican', REP: 'Republican', REPUBLICAN: 'Republican', GOP: 'Republican',
    I: 'Independent', IND: 'Independent', INDEPENDENT: 'Independent', NPA: 'Independent',
    U: 'Unaffiliated', UNA: 'Unaffiliated', UNAFFILIATED: 'Unaffiliated',
  };
  return map[v] || (value ? value : '');
}

function normalizeVoterStatus(value: string): string {
  const v = value.toUpperCase().trim();
  if (['A', 'ACTIVE', 'REGISTERED', 'Y', 'YES'].includes(v)) return 'Registered';
  if (['I', 'INACTIVE', 'PURGED', 'N', 'NO'].includes(v)) return 'Inactive';
  return value || '';
}

function parseBool(value: string): boolean | null {
  if (!value) return null;
  const v = value.toLowerCase().trim();
  if (['1', 'y', 'yes', 'true', 't', 'owner'].includes(v)) return true;
  if (['0', 'n', 'no', 'false', 'f', 'renter', 'tenant'].includes(v)) return false;
  return null;
}

export function inferSourceKind(sourceName: string, raw: Record<string, string>): SourceKind {
  const n = sourceName.toLowerCase();
  if (n.includes('property') || n.includes('parcel') || pick(raw, ['parcel_id', 'assessed'])) return 'property';
  if (n.includes('voter') || pick(raw, ['voter_id', 'LALVOTERID'])) return 'voter';
  if (n.includes('canvass')) return 'canvass';
  if (n.includes('survey')) return 'survey';
  if (n.includes('consumer') || n.includes('licensed')) return 'consumer';
  if (n.includes('mock')) return 'mock';
  return 'other';
}

export function makeBlockKey(zip: string, phoneticLast: string, lastName: string): string {
  const z = zip || '00000';
  const p = phoneticLast || soundex(lastName) || 'XXXX';
  return `${z}|${p}`;
}

export function standardizeRow(
  raw: Record<string, string>,
  opts: { sourceName: string; sourceRowKey: string; sourceKind?: SourceKind }
): StandardizedRow {
  const firstName = normalizeName(
    pick(raw, ['first_name', 'firstname', 'first', 'Voters_FirstName', 'FirstName'])
  );
  const lastName = normalizeName(
    pick(raw, ['last_name', 'lastname', 'last', 'Voters_LastName', 'LastName'])
  );
  const full =
    normalizeName(pick(raw, ['full_name', 'name', 'FullName'])) ||
    [firstName, lastName].filter(Boolean).join(' ');

  const street = normalizeStreet(
    pick(raw, ['street', 'address', 'address1', 'street_address', 'Residence_Addresses_AddressLine'])
  );
  const unit = pick(raw, ['unit', 'apt', 'apartment', 'suite']).toUpperCase().trim();
  const city = normalizeName(pick(raw, ['city', 'City', 'Residence_Addresses_City']));
  const state = normalizeState(pick(raw, ['state', 'State', 'Residence_Addresses_State']));
  const zip = normalizeZip(pick(raw, ['zip', 'zipcode', 'zip_code', 'PostalCode', 'Residence_Addresses_Zip']));
  const { years, birthdate } = parseAge(raw);
  const phoneticLast = soundex(lastName);
  const latStr = pick(raw, ['latitude', 'lat', 'Latitude']);
  const lngStr = pick(raw, ['longitude', 'lng', 'lon', 'Longitude']);
  const latitude = latStr && !Number.isNaN(Number(latStr)) ? Number(latStr) : null;
  const longitude = lngStr && !Number.isNaN(Number(lngStr)) ? Number(lngStr) : null;

  return {
    sourceRowKey: opts.sourceRowKey,
    sourceName: opts.sourceName,
    sourceKind: opts.sourceKind || inferSourceKind(opts.sourceName, raw),
    firstName,
    lastName,
    fullNameNormalized: full,
    email: normalizeEmail(pick(raw, ['email', 'Email', 'email_address'])),
    phone: normalizePhone(pick(raw, ['phone', 'Phone', 'mobile', 'cell', 'Voters_Phone'])),
    street,
    unit,
    city,
    state,
    zip,
    birthdate,
    ageYears: years,
    ageBucket: ageBucketFromYears(years),
    party: normalizeParty(pick(raw, ['party', 'Party', 'Parties_Description', 'party_affiliation'])),
    gender: pick(raw, ['gender', 'Gender', 'Voters_Gender']),
    voterStatus: normalizeVoterStatus(
      pick(raw, ['voter_status', 'registration_status', 'Voters_Active', 'status'])
    ),
    district: pick(raw, ['district', 'district_code', 'cd', 'CongressionalDistrict']).toUpperCase(),
    ownerOccupied: parseBool(pick(raw, ['owner_occupied', 'owner_occupant', 'occupancy'])),
    propertyType: pick(raw, ['property_type', 'land_use', 'use_code']),
    latitude,
    longitude,
    phoneticLast,
    blockKey: makeBlockKey(zip, phoneticLast, lastName),
    raw,
  };
}
