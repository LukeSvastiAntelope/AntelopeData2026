/**
 * Conservative merge invariants (FM3 decision + person-merge survivorship).
 *
 *   npx tsx --tsconfig tsconfig.json scripts/collation/test-merge-thresholds.ts
 */

import { readFileSync } from 'fs';
import path from 'path';
import {
  FM3_AUTO_MERGE_MIN_DEFAULT,
  FM3_REVIEW_MIN_DEFAULT,
  decideFm3Match,
  getFm3Thresholds,
} from '../../src/app/utils/database/fm3-thresholds';
import {
  buildSurvivorship,
  undoPersonMerge,
  type PersonMergeRow,
} from '../../src/app/utils/database/person-merge';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

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

function main() {
  // --- Read exact defaults from shared module (do not hardcode a guess) ---
  const t = getFm3Thresholds({});
  assert(t.autoMergeMin === FM3_AUTO_MERGE_MIN_DEFAULT, 'autoMergeMin from module');
  assert(t.reviewMin === FM3_REVIEW_MIN_DEFAULT, 'reviewMin from module');
  assert(t.autoMergeMin === 0.92, `expected default auto=0.92 got ${t.autoMergeMin}`);
  assert(t.reviewMin === 0.78, `expected default review=0.78 got ${t.reviewMin}`);

  // Decision boundary
  assert(decideFm3Match(0.92, t) === 'auto_merge', '≥ auto → auto_merge');
  assert(decideFm3Match(0.99, t) === 'auto_merge', 'high → auto_merge');
  assert(decideFm3Match(0.919999, t) === 'review', 'just under auto → review');
  assert(decideFm3Match(0.78, t) === 'review', '≥ review → review');
  assert(decideFm3Match(0.779999, t) === 'reject', 'under review → reject');
  assert(decideFm3Match(Number.NaN, t) === 'reject', 'NaN → reject');

  // --- Survivorship: prefer non-empty; on ties prefer higher match_confidence ---
  {
    const survivor = base({
      id: 1,
      email: null,
      phone: '555-0100',
      first_name: 'Pat',
      match_confidence: 0.6,
    });
    const loser = base({
      id: 2,
      email: 'pat@example.com',
      phone: null,
      first_name: 'Patricia',
      match_confidence: 0.9,
    });
    const merged = buildSurvivorship(survivor, loser, 0.95);
    assert(merged.fields.email === 'pat@example.com', 'prefer non-empty email from loser');
    assert(merged.fields.phone === '555-0100', 'prefer non-empty phone from survivor');
    // Tie on both non-empty first names → higher match_confidence (loser 0.9)
    assert(
      merged.fields.first_name === 'Patricia',
      `tie prefers higher confidence, got ${merged.fields.first_name}`
    );
    assert(merged.matchConfidence >= 0.95, 'pair score lifts confidence');
  }

  // Equal confidence tie keeps survivor (aConf >= bConf)
  {
    const survivor = base({
      id: 3,
      first_name: 'Alex',
      match_confidence: 0.8,
    });
    const loser = base({
      id: 4,
      first_name: 'Alexander',
      match_confidence: 0.8,
    });
    const merged = buildSurvivorship(survivor, loser, 0.93);
    assert(merged.fields.first_name === 'Alex', 'equal conf keeps survivor');
  }

  // --- Reversibility: soft-archive only, never hard-delete ---
  assert(typeof undoPersonMerge === 'function', 'undoPersonMerge exported (recoverable)');
  const mergeSrc = readFileSync(
    path.resolve(__dirname, '../../src/app/utils/database/person-merge.ts'),
    'utf8'
  );
  assert(
    /merged_into_person_id\s*=\s*\?/.test(mergeSrc),
    'auto-merge soft-archives via merged_into_person_id'
  );
  assert(
    !/DELETE\s+FROM\s+person_records/i.test(mergeSrc),
    'never hard-deletes person_records'
  );
  assert(
    /Reverse an applied merge/i.test(mergeSrc),
    'undo path documented/implemented'
  );

  console.log({
    thresholds: t,
    boundary: {
      autoAt: decideFm3Match(t.autoMergeMin, t),
      reviewAt: decideFm3Match(t.reviewMin, t),
      rejectAt: decideFm3Match(t.reviewMin - 0.001, t),
    },
  });
  console.log('PASS: conservative-merge — FM3 thresholds + survivorship + soft-archive');
}

main();
