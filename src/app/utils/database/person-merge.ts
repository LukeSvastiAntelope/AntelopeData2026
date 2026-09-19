/**
 * FM3/FM4 merge helpers — unify two person_records conservatively.
 *
 * FM4 write-back:
 *  - Soft-archives the loser (merged_into_person_id) — never hard-delete.
 *  - Records person_merge_audit.merged_from so every merge is reversible.
 *  - Idempotent: settled pairs / already-archived persons are skipped.
 *  - Never overrides confirmed door-knock or DNC flags (follow canonical).
 *  - Survivorship: prefer non-empty; prefer higher prior match_confidence on ties.
 */

import type { PoolConnection, ResultSetHeader } from 'mysql2/promise';
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
  canvass_status: string | null;
  canvass_party: string | null;
  canvass_notes: string | null;
  canvass_confirmed_at: Date | string | null;
  canvass_by_user_id: number | null;
  merged_into_person_id: number | null;
  merged_at: Date | string | null;
  field_provenance: unknown;
  source_row_ids: unknown;
  latitude: number | null;
  longitude: number | null;
  created_at?: Date | string;
  updated_at?: Date | string;
};

export type MergeOptions = {
  matchCandidateId?: number | null;
  mergeCandidateId?: number | null;
  runId?: string | null;
  notes?: string | null;
};

export type MergeResult = {
  survivorId: number;
  loserId: number;
  clusterKey: string;
  auditId: number | null;
  skipped: boolean;
  reason?: string;
};

export type FkMoves = {
  person_source_rows: number[];
  contact_suppression: number[];
  canvass_contacts: number[];
  turf_addresses: Array<{ turf_id: number; voter_geo_id: number }>;
  turf_stop_outcomes: number[];
  voter_propensity:
    | { action: 'moved' }
    | { action: 'dropped'; snapshot: Record<string, unknown> }
    | { action: 'none' };
};

/** Door-knock / DNC ranks — higher wins; fuzzy merge never downgrades these. */
const CANVASS_RANK: Record<string, number> = {
  dnc_request: 100,
  refused: 90,
  confirmed: 80,
  supporter: 75,
  lean_support: 70,
  undecided: 65,
  lean_against: 60,
  contacted: 40,
  not_home: 35,
  moved: 30,
  wrong_address: 30,
  not_contacted: 10,
};

function canvassRank(status: string | null | undefined): number {
  if (!status) return 0;
  return CANVASS_RANK[status] ?? 20;
}

function isProtectedCanvass(status: string | null | undefined): boolean {
  return canvassRank(status) >= 60;
}

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

function toMs(v: Date | string | null | undefined): number {
  if (v == null) return 0;
  const t = v instanceof Date ? v.getTime() : Date.parse(String(v));
  return Number.isFinite(t) ? t : 0;
}

/** Prefer DNC / confirmed door-knock; never wipe protected canvass with empty. */
export function pickCanvassFields(
  survivor: PersonMergeRow,
  loser: PersonMergeRow
): {
  canvass_status: string | null;
  canvass_party: string | null;
  canvass_notes: string | null;
  canvass_confirmed_at: Date | string | null;
  canvass_by_user_id: number | null;
  from: 'survivor' | 'loser' | 'both';
} {
  const sRank = canvassRank(survivor.canvass_status);
  const lRank = canvassRank(loser.canvass_status);

  let winner: 'survivor' | 'loser' = 'survivor';
  if (lRank > sRank) winner = 'loser';
  else if (lRank === sRank && lRank > 0) {
    if (toMs(loser.canvass_confirmed_at) > toMs(survivor.canvass_confirmed_at)) {
      winner = 'loser';
    }
  }

  const src = winner === 'survivor' ? survivor : loser;
  const other = winner === 'survivor' ? loser : survivor;

  // Party: protected door status keeps its canvass_party; else fill from other
  let canvassParty = (src.canvass_party || '').trim() || null;
  if (!canvassParty) {
    canvassParty = (other.canvass_party || '').trim() || null;
  }

  const notes =
    [src.canvass_notes, other.canvass_notes]
      .map((n) => (n || '').trim())
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i)
      .join(' | ') || null;

  return {
    canvass_status: src.canvass_status || other.canvass_status || null,
    canvass_party: canvassParty,
    canvass_notes: notes,
    canvass_confirmed_at:
      src.canvass_confirmed_at || other.canvass_confirmed_at || null,
    canvass_by_user_id: src.canvass_by_user_id ?? other.canvass_by_user_id ?? null,
    from: sRank > 0 && lRank > 0 ? 'both' : winner,
  };
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
  // Party lean: door-confirmed canvass_party / protected status wins over file party
  const canvass = pickCanvassFields(survivor, loser);
  let party = pickString(survivor.party, loser.party, aConf, bConf);
  if (isProtectedCanvass(canvass.canvass_status) && canvass.canvass_party) {
    // Keep file party from survivorship but never invent against door confirm —
    // display layer already prefers canvass_party; leave party as weaker lean.
    party = pickString(survivor.party, loser.party, aConf, bConf);
  }
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
    canvass: {
      value: {
        status: canvass.canvass_status,
        party: canvass.canvass_party,
      },
      from: canvass.from,
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
      canvass_status: canvass.canvass_status,
      canvass_party: canvass.canvass_party,
      canvass_notes: canvass.canvass_notes,
      canvass_confirmed_at: canvass.canvass_confirmed_at,
      canvass_by_user_id: canvass.canvass_by_user_id,
    },
  };
}

function snapshotRow(row: PersonMergeRow): Record<string, unknown> {
  return JSON.parse(
    JSON.stringify(row, (_k, v) => (v instanceof Date ? v.toISOString() : v))
  );
}

/** Follow merged_into chain to the live canonical person. */
export async function resolveCanonicalPersonId(
  conn: PoolConnection,
  organizationId: number,
  personId: number
): Promise<number | null> {
  let id = personId;
  for (let depth = 0; depth < 16; depth++) {
    const [rows] = await conn.execute(
      `SELECT id, merged_into_person_id FROM person_records
       WHERE id = ? AND organization_id = ? LIMIT 1`,
      [id, organizationId]
    );
    const row = (rows as { id: number; merged_into_person_id: number | null }[])[0];
    if (!row) return null;
    if (row.merged_into_person_id == null) return Number(row.id);
    id = Number(row.merged_into_person_id);
  }
  throw new Error(`merge chain too deep for person #${personId}`);
}

async function findAppliedAudit(
  conn: PoolConnection,
  organizationId: number,
  leftId: number,
  rightId: number
): Promise<{ id: number; survivor_person_id: number; loser_person_id: number } | null> {
  const a = Math.min(leftId, rightId);
  const b = Math.max(leftId, rightId);
  const [rows] = await conn.execute(
    `SELECT id, survivor_person_id, loser_person_id FROM person_merge_audit
     WHERE organization_id = ? AND status = 'applied'
       AND (
         (survivor_person_id = ? AND loser_person_id = ?)
         OR (survivor_person_id = ? AND loser_person_id = ?)
       )
     LIMIT 1`,
    [organizationId, a, b, b, a]
  );
  const row = (rows as any[])[0];
  return row
    ? {
        id: Number(row.id),
        survivor_person_id: Number(row.survivor_person_id),
        loser_person_id: Number(row.loser_person_id),
      }
    : null;
}

async function collectIds(
  conn: PoolConnection,
  sql: string,
  params: unknown[]
): Promise<number[]> {
  const [rows] = await conn.execute(sql, params);
  return (rows as { id: number }[]).map((r) => Number(r.id));
}

/**
 * Write-back merge: update survivor cluster_key + match_confidence, soft-archive
 * loser, record merged_from audit. Idempotent on settled pairs.
 */
export async function autoMergePersons(
  conn: PoolConnection,
  organizationId: number,
  personAId: number,
  personBId: number,
  pairScore: number,
  options: MergeOptions = {}
): Promise<MergeResult> {
  const canonA = await resolveCanonicalPersonId(conn, organizationId, personAId);
  const canonB = await resolveCanonicalPersonId(conn, organizationId, personBId);
  if (canonA == null || canonB == null) {
    throw new Error(`auto-merge: person not found (${personAId}/${personBId})`);
  }
  if (canonA === canonB) {
    return {
      survivorId: canonA,
      loserId: Math.max(personAId, personBId),
      clusterKey: '',
      auditId: null,
      skipped: true,
      reason: 'already_same_canonical',
    };
  }

  const leftId = Math.min(canonA, canonB);
  const rightId = Math.max(canonA, canonB);

  const existing = await findAppliedAudit(conn, organizationId, leftId, rightId);
  if (existing) {
    return {
      survivorId: existing.survivor_person_id,
      loserId: existing.loser_person_id,
      clusterKey: '',
      auditId: existing.id,
      skipped: true,
      reason: 'already_merged',
    };
  }

  const [rows] = await conn.execute(
    `SELECT * FROM person_records
     WHERE organization_id = ? AND id IN (?, ?)
       AND merged_into_person_id IS NULL
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

  let clusterKey = merged.clusterKey;
  const [clash] = await conn.execute(
    `SELECT id FROM person_records
     WHERE organization_id = ? AND cluster_key = ? AND id NOT IN (?, ?) LIMIT 1`,
    [organizationId, clusterKey, survivor.id, loser.id]
  );
  if ((clash as any[]).length) {
    clusterKey = `${clusterKey}${String(survivor.id).slice(-2)}`;
  }

  const survivorBefore = snapshotRow(survivor);
  const loserBefore = snapshotRow(loser);

  const fkMoves: FkMoves = {
    person_source_rows: await collectIds(
      conn,
      `SELECT id FROM person_source_rows WHERE person_record_id = ? AND organization_id <=> ?`,
      [loser.id, organizationId]
    ),
    contact_suppression: await collectIds(
      conn,
      `SELECT id FROM contact_suppression WHERE person_record_id = ? AND organization_id = ?`,
      [loser.id, organizationId]
    ),
    canvass_contacts: await collectIds(
      conn,
      `SELECT id FROM canvass_contacts WHERE person_record_id = ? AND organization_id = ?`,
      [loser.id, organizationId]
    ),
    turf_addresses: [],
    turf_stop_outcomes: await collectIds(
      conn,
      `SELECT id FROM turf_stop_outcomes WHERE person_record_id = ? AND organization_id = ?`,
      [loser.id, organizationId]
    ),
    voter_propensity: { action: 'none' },
  };

  {
    const [taRows] = await conn.execute(
      `SELECT turf_id, voter_geo_id FROM turf_addresses WHERE person_record_id = ?`,
      [loser.id]
    );
    fkMoves.turf_addresses = (taRows as { turf_id: number; voter_geo_id: number }[]).map(
      (r) => ({ turf_id: Number(r.turf_id), voter_geo_id: Number(r.voter_geo_id) })
    );
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
       canvass_status = ?, canvass_party = ?, canvass_notes = ?,
       canvass_confirmed_at = ?, canvass_by_user_id = ?,
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
      f.canvass_status ?? null,
      f.canvass_party ?? null,
      f.canvass_notes ?? null,
      f.canvass_confirmed_at
        ? f.canvass_confirmed_at instanceof Date
          ? f.canvass_confirmed_at
          : new Date(String(f.canvass_confirmed_at))
        : null,
      f.canvass_by_user_id ?? null,
      JSON.stringify(merged.provenance),
      JSON.stringify(merged.sourceRowIds),
      survivor.id,
      organizationId,
    ]
  );

  // Reassign FKs loser → survivor (logged for undo)
  if (fkMoves.person_source_rows.length) {
    await conn.execute(
      `UPDATE person_source_rows SET person_record_id = ?
       WHERE person_record_id = ? AND organization_id <=> ?`,
      [survivor.id, loser.id, organizationId]
    );
  }
  if (fkMoves.contact_suppression.length) {
    await conn.execute(
      `UPDATE contact_suppression SET person_record_id = ?
       WHERE person_record_id = ? AND organization_id = ?`,
      [survivor.id, loser.id, organizationId]
    );
  }
  if (fkMoves.canvass_contacts.length) {
    await conn.execute(
      `UPDATE canvass_contacts SET person_record_id = ?
       WHERE person_record_id = ? AND organization_id = ?`,
      [survivor.id, loser.id, organizationId]
    );
  }
  if (fkMoves.turf_addresses.length) {
    await conn.execute(
      `UPDATE turf_addresses SET person_record_id = ?
       WHERE person_record_id = ?`,
      [survivor.id, loser.id]
    );
  }
  if (fkMoves.turf_stop_outcomes.length) {
    await conn.execute(
      `UPDATE turf_stop_outcomes SET person_record_id = ?
       WHERE person_record_id = ? AND organization_id = ?`,
      [survivor.id, loser.id, organizationId]
    );
  }

  const [propLoser] = await conn.execute(
    `SELECT * FROM voter_propensity WHERE person_record_id = ? LIMIT 1`,
    [loser.id]
  );
  const [propSurv] = await conn.execute(
    `SELECT person_record_id FROM voter_propensity WHERE person_record_id = ? LIMIT 1`,
    [survivor.id]
  );
  if ((propLoser as any[]).length) {
    if ((propSurv as any[]).length) {
      fkMoves.voter_propensity = {
        action: 'dropped',
        snapshot: snapshotRow((propLoser as any[])[0]),
      };
      await conn.execute(`DELETE FROM voter_propensity WHERE person_record_id = ?`, [
        loser.id,
      ]);
    } else {
      fkMoves.voter_propensity = { action: 'moved' };
      await conn.execute(
        `UPDATE voter_propensity SET person_record_id = ? WHERE person_record_id = ?`,
        [survivor.id, loser.id]
      );
    }
  }

  // Soft-archive loser — row retained for undo + FK stability on match tables
  await conn.execute(
    `UPDATE person_records
     SET merged_into_person_id = ?,
         merged_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND organization_id = ?`,
    [survivor.id, loser.id, organizationId]
  );

  const [afterRows] = await conn.execute(
    `SELECT * FROM person_records WHERE id = ? AND organization_id = ? LIMIT 1`,
    [survivor.id, organizationId]
  );
  const survivorAfter = snapshotRow((afterRows as PersonMergeRow[])[0]);

  const mergedAt = new Date().toISOString();
  const mergedFrom = {
    records: [
      {
        person_id: survivor.id,
        cluster_key: survivor.cluster_key,
        role: 'survivor',
      },
      {
        person_id: loser.id,
        cluster_key: loser.cluster_key,
        role: 'loser',
      },
    ],
    score: pairScore,
    timestamp: mergedAt,
    resulting_cluster_key: clusterKey,
    resulting_match_confidence: merged.matchConfidence,
  };

  const [auditResult] = await conn.execute<ResultSetHeader>(
    `INSERT INTO person_merge_audit
      (organization_id, survivor_person_id, loser_person_id, match_score,
       match_candidate_id, merge_candidate_id, run_id, merged_from,
       survivor_before, loser_before, survivor_after, fk_moves, status, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'applied', ?)`,
    [
      organizationId,
      survivor.id,
      loser.id,
      pairScore,
      options.matchCandidateId ?? null,
      options.mergeCandidateId ?? null,
      options.runId ?? null,
      JSON.stringify(mergedFrom),
      JSON.stringify(survivorBefore),
      JSON.stringify(loserBefore),
      JSON.stringify(survivorAfter),
      JSON.stringify(fkMoves),
      options.notes ?? null,
    ]
  );

  // Settle this exact pair only — do not re-merge on incremental re-runs
  await conn.execute(
    `UPDATE person_match_candidates
     SET decision = 'auto_merge'
     WHERE organization_id = ?
       AND decision = 'pending'
       AND left_person_id = ? AND right_person_id = ?`,
    [organizationId, Math.min(survivor.id, loser.id), Math.max(survivor.id, loser.id)]
  );

  return {
    survivorId: survivor.id,
    loserId: loser.id,
    clusterKey,
    auditId: Number(auditResult.insertId),
    skipped: false,
  };
}

function idsClause(ids: number[]): { sql: string; params: number[] } {
  if (!ids.length) return { sql: '0', params: [] };
  return { sql: ids.map(() => '?').join(','), params: ids };
}

/**
 * Reverse an applied merge using person_merge_audit.merged_from + snapshots.
 */
export async function undoPersonMerge(
  conn: PoolConnection,
  organizationId: number,
  auditId: number,
  undoneBy?: number | null
): Promise<{ survivorId: number; loserId: number }> {
  const [rows] = await conn.execute(
    `SELECT * FROM person_merge_audit
     WHERE id = ? AND organization_id = ? LIMIT 1
     FOR UPDATE`,
    [auditId, organizationId]
  );
  const audit = (rows as any[])[0];
  if (!audit) throw new Error(`merge audit #${auditId} not found`);
  if (audit.status !== 'applied') {
    throw new Error(`merge audit #${auditId} is already ${audit.status}`);
  }

  const survivorId = Number(audit.survivor_person_id);
  const loserId = Number(audit.loser_person_id);
  const survivorBefore =
    typeof audit.survivor_before === 'string'
      ? JSON.parse(audit.survivor_before)
      : audit.survivor_before;
  const loserBefore =
    typeof audit.loser_before === 'string'
      ? JSON.parse(audit.loser_before)
      : audit.loser_before;
  const fkMoves: FkMoves =
    typeof audit.fk_moves === 'string' ? JSON.parse(audit.fk_moves) : audit.fk_moves;

  // Restore survivor demographics from pre-merge snapshot
  await conn.execute(
    `UPDATE person_records SET
       cluster_key = ?, address_point_id = ?,
       first_name = ?, last_name = ?, full_name_normalized = ?,
       email = ?, phone = ?, birthdate = ?, age_years = ?, age_bucket = ?,
       party = ?, gender = ?, voter_status = ?, district = ?,
       city = ?, state = ?, zip = ?, owner_occupied = ?, property_type = ?,
       latitude = ?, longitude = ?, match_confidence = ?,
       canvass_status = ?, canvass_party = ?, canvass_notes = ?,
       canvass_confirmed_at = ?, canvass_by_user_id = ?,
       field_provenance = ?, source_row_ids = ?,
       merged_into_person_id = NULL, merged_at = NULL,
       updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND organization_id = ?`,
    [
      survivorBefore.cluster_key,
      survivorBefore.address_point_id ?? null,
      survivorBefore.first_name ?? null,
      survivorBefore.last_name ?? null,
      survivorBefore.full_name_normalized ?? null,
      survivorBefore.email ?? null,
      survivorBefore.phone ?? null,
      survivorBefore.birthdate
        ? String(survivorBefore.birthdate).slice(0, 10)
        : null,
      survivorBefore.age_years ?? null,
      survivorBefore.age_bucket ?? null,
      survivorBefore.party ?? null,
      survivorBefore.gender ?? null,
      survivorBefore.voter_status ?? null,
      survivorBefore.district ?? null,
      survivorBefore.city ?? null,
      survivorBefore.state ?? null,
      survivorBefore.zip ?? null,
      survivorBefore.owner_occupied ?? null,
      survivorBefore.property_type ?? null,
      survivorBefore.latitude ?? null,
      survivorBefore.longitude ?? null,
      survivorBefore.match_confidence ?? 0,
      survivorBefore.canvass_status ?? null,
      survivorBefore.canvass_party ?? null,
      survivorBefore.canvass_notes ?? null,
      survivorBefore.canvass_confirmed_at
        ? new Date(survivorBefore.canvass_confirmed_at)
        : null,
      survivorBefore.canvass_by_user_id ?? null,
      typeof survivorBefore.field_provenance === 'string'
        ? survivorBefore.field_provenance
        : JSON.stringify(survivorBefore.field_provenance ?? null),
      typeof survivorBefore.source_row_ids === 'string'
        ? survivorBefore.source_row_ids
        : JSON.stringify(survivorBefore.source_row_ids ?? null),
      survivorId,
      organizationId,
    ]
  );

  // Un-archive loser + restore snapshot
  await conn.execute(
    `UPDATE person_records SET
       cluster_key = ?, address_point_id = ?,
       first_name = ?, last_name = ?, full_name_normalized = ?,
       email = ?, phone = ?, birthdate = ?, age_years = ?, age_bucket = ?,
       party = ?, gender = ?, voter_status = ?, district = ?,
       city = ?, state = ?, zip = ?, owner_occupied = ?, property_type = ?,
       latitude = ?, longitude = ?, match_confidence = ?,
       canvass_status = ?, canvass_party = ?, canvass_notes = ?,
       canvass_confirmed_at = ?, canvass_by_user_id = ?,
       field_provenance = ?, source_row_ids = ?,
       merged_into_person_id = NULL, merged_at = NULL,
       updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND organization_id = ?`,
    [
      loserBefore.cluster_key,
      loserBefore.address_point_id ?? null,
      loserBefore.first_name ?? null,
      loserBefore.last_name ?? null,
      loserBefore.full_name_normalized ?? null,
      loserBefore.email ?? null,
      loserBefore.phone ?? null,
      loserBefore.birthdate ? String(loserBefore.birthdate).slice(0, 10) : null,
      loserBefore.age_years ?? null,
      loserBefore.age_bucket ?? null,
      loserBefore.party ?? null,
      loserBefore.gender ?? null,
      loserBefore.voter_status ?? null,
      loserBefore.district ?? null,
      loserBefore.city ?? null,
      loserBefore.state ?? null,
      loserBefore.zip ?? null,
      loserBefore.owner_occupied ?? null,
      loserBefore.property_type ?? null,
      loserBefore.latitude ?? null,
      loserBefore.longitude ?? null,
      loserBefore.match_confidence ?? 0,
      loserBefore.canvass_status ?? null,
      loserBefore.canvass_party ?? null,
      loserBefore.canvass_notes ?? null,
      loserBefore.canvass_confirmed_at
        ? new Date(loserBefore.canvass_confirmed_at)
        : null,
      loserBefore.canvass_by_user_id ?? null,
      typeof loserBefore.field_provenance === 'string'
        ? loserBefore.field_provenance
        : JSON.stringify(loserBefore.field_provenance ?? null),
      typeof loserBefore.source_row_ids === 'string'
        ? loserBefore.source_row_ids
        : JSON.stringify(loserBefore.source_row_ids ?? null),
      loserId,
      organizationId,
    ]
  );

  // Reverse FK moves
  const src = idsClause(fkMoves.person_source_rows || []);
  if (src.params.length) {
    await conn.execute(
      `UPDATE person_source_rows SET person_record_id = ?
       WHERE id IN (${src.sql}) AND person_record_id = ?`,
      [loserId, ...src.params, survivorId]
    );
  }
  const cs = idsClause(fkMoves.contact_suppression || []);
  if (cs.params.length) {
    await conn.execute(
      `UPDATE contact_suppression SET person_record_id = ?
       WHERE id IN (${cs.sql}) AND person_record_id = ?`,
      [loserId, ...cs.params, survivorId]
    );
  }
  const cc = idsClause(fkMoves.canvass_contacts || []);
  if (cc.params.length) {
    await conn.execute(
      `UPDATE canvass_contacts SET person_record_id = ?
       WHERE id IN (${cc.sql}) AND person_record_id = ?`,
      [loserId, ...cc.params, survivorId]
    );
  }
  const ta = fkMoves.turf_addresses || [];
  for (const row of ta) {
    await conn.execute(
      `UPDATE turf_addresses SET person_record_id = ?
       WHERE turf_id = ? AND voter_geo_id = ? AND person_record_id = ?`,
      [loserId, row.turf_id, row.voter_geo_id, survivorId]
    );
  }
  const tso = idsClause(fkMoves.turf_stop_outcomes || []);
  if (tso.params.length) {
    await conn.execute(
      `UPDATE turf_stop_outcomes SET person_record_id = ?
       WHERE id IN (${tso.sql}) AND person_record_id = ?`,
      [loserId, ...tso.params, survivorId]
    );
  }

  const vp = fkMoves.voter_propensity;
  if (vp?.action === 'moved') {
    await conn.execute(
      `UPDATE voter_propensity SET person_record_id = ? WHERE person_record_id = ?`,
      [loserId, survivorId]
    );
  } else if (vp?.action === 'dropped' && vp.snapshot) {
    const s = vp.snapshot;
    await conn.execute(
      `INSERT INTO voter_propensity
        (person_record_id, organization_id, p0, evidence_e, prior_weight,
         posterior_q, propensity, confidence, tier, decay_k, formula_version,
         evidence_json, recomputed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         p0 = VALUES(p0), evidence_e = VALUES(evidence_e),
         prior_weight = VALUES(prior_weight), posterior_q = VALUES(posterior_q),
         propensity = VALUES(propensity), confidence = VALUES(confidence),
         tier = VALUES(tier), decay_k = VALUES(decay_k),
         formula_version = VALUES(formula_version), evidence_json = VALUES(evidence_json)`,
      [
        loserId,
        s.organization_id ?? organizationId,
        s.p0,
        s.evidence_e,
        s.prior_weight,
        s.posterior_q ?? null,
        s.propensity,
        s.confidence,
        s.tier,
        s.decay_k,
        s.formula_version,
        typeof s.evidence_json === 'string'
          ? s.evidence_json
          : JSON.stringify(s.evidence_json ?? null),
        s.recomputed_at ? new Date(String(s.recomputed_at)) : new Date(),
      ]
    );
  }

  await conn.execute(
    `UPDATE person_merge_audit
     SET status = 'undone', undone_at = CURRENT_TIMESTAMP, undone_by = ?
     WHERE id = ? AND organization_id = ?`,
    [undoneBy ?? null, auditId, organizationId]
  );

  return { survivorId, loserId };
}
