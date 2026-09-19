/**
 * Lightweight FM4 unit checks (no DB) — canvass/DNC survivorship + snapshot shape.
 *   npx tsx scripts/collation/smoke-fm4-unit.ts
 */

import {
  buildSurvivorship,
  pickCanvassFields,
  type PersonMergeRow,
} from '../../src/app/utils/database/person-merge';

function base(partial: Partial<PersonMergeRow> & { id: number }): PersonMergeRow {
  return {
    organization_id: 1,
    cluster_key: `ck_${partial.id}`,
    address_point_id: null,
    first_name: 'Pat',
    last_name: 'Lee',
    full_name_normalized: 'pat lee',
    email: null,
    phone: null,
    birthdate: null,
    age_years: null,
    age_bucket: null,
    party: 'Unaffiliated',
    gender: null,
    voter_status: null,
    district: null,
    city: null,
    state: 'NJ',
    zip: '07001',
    owner_occupied: null,
    property_type: null,
    match_confidence: 0.5,
    canvass_status: null,
    canvass_party: null,
    canvass_notes: null,
    canvass_confirmed_at: null,
    canvass_by_user_id: null,
    merged_into_person_id: null,
    merged_at: null,
    field_provenance: null,
    source_row_ids: [],
    latitude: null,
    longitude: null,
    ...partial,
  };
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

// DNC on loser must win over empty survivor
{
  const s = base({ id: 1, canvass_status: null, party: 'Republican' });
  const l = base({
    id: 2,
    canvass_status: 'dnc_request',
    canvass_party: null,
    canvass_notes: 'asked off list',
  });
  const c = pickCanvassFields(s, l);
  assert(c.canvass_status === 'dnc_request', 'DNC must survive onto canonical');
  assert((c.canvass_notes || '').includes('asked off list'), 'DNC notes preserved');
}

// Confirmed door-knock beats not_contacted; canvass_party kept
{
  const s = base({
    id: 1,
    canvass_status: 'confirmed',
    canvass_party: 'Democrat',
    canvass_confirmed_at: '2026-01-01T00:00:00Z',
  });
  const l = base({
    id: 2,
    canvass_status: 'not_home',
    party: 'Republican',
    canvass_party: null,
  });
  const merged = buildSurvivorship(s, l, 0.95);
  assert(
    merged.fields.canvass_status === 'confirmed',
    'confirmed door-knock must not be overridden'
  );
  assert(merged.fields.canvass_party === 'Democrat', 'door party must stick');
  assert(merged.matchConfidence >= 0.95, 'pair score lifts confidence');
  assert(!!merged.clusterKey && merged.clusterKey.length === 16, 'cluster_key assigned');
}

// merged_from-shaped payload fields exist on survivorship provenance
{
  const s = base({ id: 10 });
  const l = base({ id: 20, first_name: 'Patricia' });
  const merged = buildSurvivorship(s, l, 0.93);
  assert(merged.provenance.merge?.from === 'both', 'merge provenance recorded');
  const mv = merged.provenance.merge.value as { survivorId: number; loserId: number };
  assert(mv.survivorId === 10 && mv.loserId === 20, 'merge ids recorded');
}

console.log('PASS: FM4 unit — canvass/DNC preservation + survivorship');
