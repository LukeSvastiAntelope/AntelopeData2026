/**
 * G2 Turf cutting — contact_suppression + composable spatial/filter query + saved turfs.
 *
 * Eligibility (mirrors geofencing.ts include/exclude, promoted to MySQL layers):
 *   base filter ∩ include fences − exclude fences − contact_suppression − (optional) already-contacted
 */

import { openSql } from '@/app/utils/database/db';
import type { ResultSetHeader } from 'mysql2';
import { GeofenceRepo } from '@/app/utils/database/geo-repo';

export type SuppressionSource =
  | 'manual'
  | 'mailchimp'
  | 'refused'
  | 'import'
  | 'sms_stop'
  | 'other';

export type ContactSuppressionRow = {
  id: number;
  organization_id: number;
  voter_geo_id: number | null;
  voter_file_id: string | null;
  person_record_id: number | null;
  responder_agent_id: number | null;
  reason: string;
  source: SuppressionSource;
  notes: string | null;
  created_by: number | null;
  created_at: Date;
};

/** Filters applied to voter_geo (+ person_records for canvass). */
export type TurfFilters = {
  party?: string[];
  /** Inclusive lower bound on partisan_score (0–100) */
  minPartisanScore?: number | null;
  maxPartisanScore?: number | null;
  minTurnoutScore?: number | null;
  maxTurnoutScore?: number | null;
  zip?: string[];
  district?: string[];
  voterStatus?: string[];
  ageBucket?: string[];
  /** P3: hot / warm / cold from voter_propensity via nearby person */
  propensityTier?: Array<'hot' | 'warm' | 'cold'>;
  /** Preset id from voter-segment-presets (mapped to party/score where possible) */
  segmentId?: string | null;
};

export type TurfDefinition = {
  /** Include fence ids and/or labels (OR within includes) */
  includeFenceIds?: number[];
  includeFenceLabels?: string[];
  /** Exclude fence ids and/or labels (any match → out) */
  excludeFenceIds?: number[];
  excludeFenceLabels?: string[];
  filters?: TurfFilters;
  /** Global DNC layer — default true */
  excludeSuppressed?: boolean;
  /** Drop already-canvassed person_records near the address — default false */
  excludeContacted?: boolean;
  /** Canvass statuses treated as “already contacted” when excludeContacted */
  contactedStatuses?: string[];
  limit?: number;
};

export type TurfAddress = {
  voterGeoId: number;
  voterFileId: string | null;
  personRecordId: number | null;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  latitude: number;
  longitude: number;
  party: string | null;
  partisanScore: number | null;
  turnoutScore: number | null;
  label: string;
  canvassStatus: string | null;
  /** Walk order (1-based) when loaded from a saved turf */
  sortOrder?: number | null;
  /** Field outcome party if recorded on this turf stop */
  fieldParty?: string | null;
  fieldNotes?: string | null;
};

export type TurfStopStatus =
  | 'not_contacted'
  | 'contacted'
  | 'confirmed'
  | 'not_home'
  | 'refused'
  | 'moved'
  | 'wrong_address'
  | 'supporter'
  | 'lean_support'
  | 'undecided'
  | 'lean_against'
  | 'dnc_request';

export type TurfStopOutcome = {
  id: number;
  organization_id: number;
  turf_id: number;
  voter_geo_id: number;
  person_record_id: number | null;
  status: TurfStopStatus;
  party: string | null;
  notes: string | null;
  recorded_by: number;
  recorded_at: Date;
};

export type TurfRow = {
  id: number;
  organization_id: number;
  label: string;
  definition: TurfDefinition;
  assigned_to: number | null;
  address_count: number;
  notes: string | null;
  created_by: number;
  created_at: Date;
  updated_at: Date;
};

const DEFAULT_CONTACTED = [
  'contacted',
  'confirmed',
  'not_home',
  'refused',
  'moved',
  'wrong_address',
  'supporter',
  'lean_support',
  'undecided',
  'lean_against',
  'dnc_request',
];

/** Brief G3 statuses that auto-write contact_suppression. */
const DNC_STATUSES = new Set<TurfStopStatus>(['dnc_request', 'refused']);

/** Map segment presets / shorthand onto turf filters. */
export function filtersFromSegmentId(segmentId: string | null | undefined): TurfFilters {
  if (!segmentId) return {};
  const id = segmentId.trim().toLowerCase();
  switch (id) {
    case 'likely-dem':
    case 'likely-democrats':
    case 'base-democrats':
      return { party: ['Democrat'], minPartisanScore: 60 };
    case 'likely-rep':
    case 'likely-republicans':
    case 'base-republicans':
      return { party: ['Republican'], maxPartisanScore: 40 };
    case 'independents':
      return { party: ['Independent'] };
    case 'swing-voters':
      return { party: ['Independent'], minPartisanScore: 40, maxPartisanScore: 60 };
    case 'likely-voters':
      return { minTurnoutScore: 70 };
    case 'low-propensity':
      return { maxTurnoutScore: 40 };
    case 'hot':
    case 'hot-leads':
      return { propensityTier: ['hot'] };
    case 'warm':
    case 'warm-leads':
      return { propensityTier: ['warm'] };
    case 'cold':
    case 'cold-leads':
      return { propensityTier: ['cold'] };
    default:
      return { segmentId };
  }
}

export function mergeFilters(base: TurfFilters = {}, extra: TurfFilters = {}): TurfFilters {
  return {
    party: extra.party?.length ? extra.party : base.party,
    minPartisanScore:
      extra.minPartisanScore != null ? extra.minPartisanScore : base.minPartisanScore,
    maxPartisanScore:
      extra.maxPartisanScore != null ? extra.maxPartisanScore : base.maxPartisanScore,
    minTurnoutScore: extra.minTurnoutScore != null ? extra.minTurnoutScore : base.minTurnoutScore,
    maxTurnoutScore: extra.maxTurnoutScore != null ? extra.maxTurnoutScore : base.maxTurnoutScore,
    zip: extra.zip?.length ? extra.zip : base.zip,
    district: extra.district?.length ? extra.district : base.district,
    voterStatus: extra.voterStatus?.length ? extra.voterStatus : base.voterStatus,
    ageBucket: extra.ageBucket?.length ? extra.ageBucket : base.ageBucket,
    propensityTier: extra.propensityTier?.length ? extra.propensityTier : base.propensityTier,
    segmentId: extra.segmentId ?? base.segmentId,
  };
}

export type CanvassContactRow = {
  id: number;
  organization_id: number;
  voter_geo_id: number;
  person_record_id: number | null;
  voter_file_id: string | null;
  turf_id: number | null;
  canvasser_id: number;
  status: TurfStopStatus | string;
  note: string | null;
  party: string | null;
  survey_response_id: number | null;
  client_event_id: string | null;
  recorded_at: Date;
};

/** G4: append-only contact trail queries for offline delta sync. */
export class CanvassContactRepo {
  static async listSince(params: {
    organizationId: number;
    sinceId?: number | null;
    since?: string | Date | null;
    canvasserId?: number | null;
    turfId?: number | null;
    limit?: number;
  }): Promise<CanvassContactRow[]> {
    const sql = await openSql();
    const limit = Math.min(Math.max(params.limit || 500, 1), 5000);
    const where: string[] = ['organization_id = ?'];
    const args: unknown[] = [params.organizationId];

    if (params.sinceId != null && Number.isFinite(Number(params.sinceId))) {
      where.push('id > ?');
      args.push(Number(params.sinceId));
    }
    if (params.since) {
      const d = new Date(params.since);
      if (!Number.isNaN(d.getTime())) {
        where.push('recorded_at > ?');
        args.push(d);
      }
    }
    if (params.canvasserId != null) {
      where.push('canvasser_id = ?');
      args.push(Number(params.canvasserId));
    }
    if (params.turfId != null) {
      where.push('turf_id = ?');
      args.push(Number(params.turfId));
    }

    const [rows] = await sql.execute(
      `SELECT id, organization_id, voter_geo_id, person_record_id, voter_file_id,
              turf_id, canvasser_id, status, note, party, survey_response_id,
              client_event_id, recorded_at
       FROM canvass_contacts
       WHERE ${where.join(' AND ')}
       ORDER BY id ASC
       LIMIT ${limit}`,
      args
    );

    return (rows as any[]).map((r) => ({
      id: Number(r.id),
      organization_id: Number(r.organization_id),
      voter_geo_id: Number(r.voter_geo_id),
      person_record_id: r.person_record_id != null ? Number(r.person_record_id) : null,
      voter_file_id: r.voter_file_id,
      turf_id: r.turf_id != null ? Number(r.turf_id) : null,
      canvasser_id: Number(r.canvasser_id),
      status: r.status,
      note: r.note,
      party: r.party,
      survey_response_id:
        r.survey_response_id != null ? Number(r.survey_response_id) : null,
      client_event_id: r.client_event_id,
      recorded_at: r.recorded_at,
    }));
  }
}

export class ContactSuppressionRepo {
  static async list(organizationId: number, limit = 500): Promise<ContactSuppressionRow[]> {
    const sql = await openSql();
    const [rows] = await sql.execute(
      `SELECT id, organization_id, voter_geo_id, voter_file_id, person_record_id,
              responder_agent_id, reason, source, notes, created_by, created_at
       FROM contact_suppression
       WHERE organization_id = ?
       ORDER BY created_at DESC
       LIMIT ${Math.min(Math.max(limit, 1), 5000)}`,
      [organizationId]
    );
    return (rows as any[]).map(normalizeSuppression);
  }

  static async add(params: {
    organizationId: number;
    voterGeoId?: number | null;
    voterFileId?: string | null;
    personRecordId?: number | null;
    responderAgentId?: number | null;
    reason?: string;
    source?: SuppressionSource;
    notes?: string | null;
    createdBy?: number | null;
  }): Promise<ContactSuppressionRow> {
    if (
      !params.voterGeoId &&
      !params.voterFileId &&
      !params.personRecordId &&
      !params.responderAgentId
    ) {
      throw new Error('At least one of voterGeoId, voterFileId, personRecordId, responderAgentId required');
    }
    const sql = await openSql();
    const [result] = await sql.execute<ResultSetHeader>(
      `INSERT INTO contact_suppression
        (organization_id, voter_geo_id, voter_file_id, person_record_id, responder_agent_id,
         reason, source, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        params.organizationId,
        params.voterGeoId ?? null,
        params.voterFileId ?? null,
        params.personRecordId ?? null,
        params.responderAgentId ?? null,
        params.reason || 'do_not_contact',
        params.source || 'manual',
        params.notes ?? null,
        params.createdBy ?? null,
      ]
    );
    const [rows] = await sql.execute(
      `SELECT id, organization_id, voter_geo_id, voter_file_id, person_record_id,
              responder_agent_id, reason, source, notes, created_by, created_at
       FROM contact_suppression WHERE id = ? LIMIT 1`,
      [result.insertId]
    );
    return normalizeSuppression((rows as any[])[0]);
  }

  static async remove(id: number, organizationId: number): Promise<boolean> {
    const sql = await openSql();
    const [result] = await sql.execute<ResultSetHeader>(
      `DELETE FROM contact_suppression WHERE id = ? AND organization_id = ?`,
      [id, organizationId]
    );
    return result.affectedRows > 0;
  }
}

function normalizeSuppression(row: any): ContactSuppressionRow {
  return {
    id: Number(row.id),
    organization_id: Number(row.organization_id),
    voter_geo_id: row.voter_geo_id != null ? Number(row.voter_geo_id) : null,
    voter_file_id: row.voter_file_id,
    person_record_id: row.person_record_id != null ? Number(row.person_record_id) : null,
    responder_agent_id: row.responder_agent_id != null ? Number(row.responder_agent_id) : null,
    reason: row.reason,
    source: row.source,
    notes: row.notes,
    created_by: row.created_by != null ? Number(row.created_by) : null,
    created_at: row.created_at,
  };
}

async function resolveFenceIds(
  organizationId: number,
  ids: number[] | undefined,
  labels: string[] | undefined
): Promise<number[]> {
  const out = new Set<number>(ids || []);
  for (const label of labels || []) {
    const f = await GeofenceRepo.getByLabel(label, organizationId);
    if (f) out.add(f.id);
  }
  return [...out];
}

function fenceContainsSql(alias: string): string {
  return `(
    (${alias}.fence_type = 'polygon' AND ST_Contains(${alias}.geom, vg.pt))
    OR (
      ${alias}.fence_type = 'circle'
      AND ${alias}.radius_m IS NOT NULL
      AND ST_Distance_Sphere(vg.pt, ${alias}.geom) <= ${alias}.radius_m
    )
  )`;
}

/**
 * Composable turf query — single SQL with layered eligibility.
 */
export async function queryTurfAddresses(
  organizationId: number,
  definition: TurfDefinition
): Promise<TurfAddress[]> {
  const sql = await openSql();
  const includeIds = await resolveFenceIds(
    organizationId,
    definition.includeFenceIds,
    definition.includeFenceLabels
  );
  const excludeIds = await resolveFenceIds(
    organizationId,
    definition.excludeFenceIds,
    definition.excludeFenceLabels
  );

  let filters = definition.filters || {};
  if (filters.segmentId) {
    filters = mergeFilters(filtersFromSegmentId(filters.segmentId), filters);
  }

  const excludeSuppressed = definition.excludeSuppressed !== false;
  const excludeContacted = definition.excludeContacted === true;
  const contactedStatuses = definition.contactedStatuses?.length
    ? definition.contactedStatuses
    : DEFAULT_CONTACTED;
  const limit = Math.min(Math.max(definition.limit || 5000, 1), 20000);

  const where: string[] = [
    'vg.organization_id = ?',
    `vg.geocode_status IN ('ok', 'provider')`,
  ];
  const params: unknown[] = [organizationId];

  // Include layer: if any include fences, must hit at least one (classifyCanvassPoint)
  if (includeIds.length > 0) {
    where.push(
      `EXISTS (
         SELECT 1 FROM geofences fi
         WHERE fi.organization_id = ?
           AND fi.id IN (${includeIds.map(() => '?').join(',')})
           AND ${fenceContainsSql('fi')}
       )`
    );
    params.push(organizationId, ...includeIds);
  }

  // Exclude layer: any exclude fence → out
  if (excludeIds.length > 0) {
    where.push(
      `NOT EXISTS (
         SELECT 1 FROM geofences fe
         WHERE fe.organization_id = ?
           AND fe.id IN (${excludeIds.map(() => '?').join(',')})
           AND ${fenceContainsSql('fe')}
       )`
    );
    params.push(organizationId, ...excludeIds);
  }

  // Global DNC — match any key on contact_suppression (geo / file / agent / person)
  if (excludeSuppressed) {
    where.push(
      `NOT EXISTS (
         SELECT 1 FROM contact_suppression cs
         WHERE cs.organization_id = ?
           AND (
             cs.voter_geo_id = vg.id
             OR (cs.voter_file_id IS NOT NULL AND vg.voter_file_id IS NOT NULL AND cs.voter_file_id = vg.voter_file_id)
             OR (cs.responder_agent_id IS NOT NULL AND vg.responder_agent_id IS NOT NULL
                 AND cs.responder_agent_id = vg.responder_agent_id)
             OR (
               cs.person_record_id IS NOT NULL
               AND EXISTS (
                 SELECT 1 FROM person_records prs
                 WHERE prs.id = cs.person_record_id
                   AND prs.organization_id = vg.organization_id
                   AND prs.latitude IS NOT NULL AND vg.latitude IS NOT NULL
                   AND ABS(prs.latitude - vg.latitude) < 0.0002
                   AND ABS(prs.longitude - vg.longitude) < 0.0002
               )
             )
           )
       )`
    );
    params.push(organizationId);
  }

  // Already-contacted via nearby person_records
  if (excludeContacted) {
    where.push(
      `NOT EXISTS (
         SELECT 1 FROM person_records pr
         WHERE pr.organization_id = vg.organization_id
           AND pr.latitude IS NOT NULL AND pr.longitude IS NOT NULL
           AND vg.latitude IS NOT NULL AND vg.longitude IS NOT NULL
           AND ABS(pr.latitude - vg.latitude) < 0.0002
           AND ABS(pr.longitude - vg.longitude) < 0.0002
           AND COALESCE(pr.canvass_status, 'not_contacted') IN (${contactedStatuses.map(() => '?').join(',')})
       )`
    );
    params.push(...contactedStatuses);
  }

  // Attribute filters on voter_geo (+ effective party from nearby person when geo.party null)
  if (filters.party?.length) {
    where.push(
      `COALESCE(
         NULLIF(vg.party, ''),
         (
           SELECT COALESCE(NULLIF(pr2.canvass_party, ''), pr2.party)
           FROM person_records pr2
           WHERE pr2.organization_id = vg.organization_id
             AND pr2.latitude IS NOT NULL AND vg.latitude IS NOT NULL
             AND ABS(pr2.latitude - vg.latitude) < 0.0002
             AND ABS(pr2.longitude - vg.longitude) < 0.0002
           ORDER BY pr2.id ASC
           LIMIT 1
         )
       ) IN (${filters.party.map(() => '?').join(',')})`
    );
    params.push(...filters.party);
  }
  if (filters.minPartisanScore != null) {
    where.push('vg.partisan_score IS NOT NULL AND vg.partisan_score >= ?');
    params.push(filters.minPartisanScore);
  }
  if (filters.maxPartisanScore != null) {
    where.push('vg.partisan_score IS NOT NULL AND vg.partisan_score <= ?');
    params.push(filters.maxPartisanScore);
  }
  if (filters.minTurnoutScore != null) {
    where.push('vg.turnout_score IS NOT NULL AND vg.turnout_score >= ?');
    params.push(filters.minTurnoutScore);
  }
  if (filters.maxTurnoutScore != null) {
    where.push('vg.turnout_score IS NOT NULL AND vg.turnout_score <= ?');
    params.push(filters.maxTurnoutScore);
  }
  if (filters.zip?.length) {
    where.push(`vg.zip IN (${filters.zip.map(() => '?').join(',')})`);
    params.push(...filters.zip);
  }
  if (filters.propensityTier?.length) {
    where.push(
      `EXISTS (
         SELECT 1 FROM person_records prt
         JOIN voter_propensity vpt ON vpt.person_record_id = prt.id
         WHERE prt.organization_id = vg.organization_id
           AND prt.latitude IS NOT NULL AND vg.latitude IS NOT NULL
           AND ABS(prt.latitude - vg.latitude) < 0.0002
           AND ABS(prt.longitude - vg.longitude) < 0.0002
           AND vpt.tier IN (${filters.propensityTier.map(() => '?').join(',')})
       )`
    );
    params.push(...filters.propensityTier);
  }

  const [rows] = await sql.execute(
    `SELECT
       vg.id AS voter_geo_id,
       vg.voter_file_id,
       vg.street, vg.city, vg.state, vg.zip,
       vg.latitude, vg.longitude,
       vg.party, vg.partisan_score, vg.turnout_score,
       (
         SELECT pr.id FROM person_records pr
         WHERE pr.organization_id = vg.organization_id
           AND pr.latitude IS NOT NULL AND vg.latitude IS NOT NULL
           AND ABS(pr.latitude - vg.latitude) < 0.0002
           AND ABS(pr.longitude - vg.longitude) < 0.0002
         ORDER BY pr.id ASC LIMIT 1
       ) AS person_record_id,
       (
         SELECT COALESCE(pr.canvass_status, 'not_contacted') FROM person_records pr
         WHERE pr.organization_id = vg.organization_id
           AND pr.latitude IS NOT NULL AND vg.latitude IS NOT NULL
           AND ABS(pr.latitude - vg.latitude) < 0.0002
           AND ABS(pr.longitude - vg.longitude) < 0.0002
         ORDER BY pr.id ASC LIMIT 1
       ) AS canvass_status
     FROM voter_geo vg
     WHERE ${where.join(' AND ')}
     ORDER BY vg.zip ASC, vg.street ASC, vg.id ASC
     LIMIT ${limit}`,
    params
  );

  return (rows as any[]).map((r) => ({
    voterGeoId: Number(r.voter_geo_id),
    voterFileId: r.voter_file_id,
    personRecordId: r.person_record_id != null ? Number(r.person_record_id) : null,
    street: r.street,
    city: r.city,
    state: r.state,
    zip: r.zip,
    latitude: Number(r.latitude),
    longitude: Number(r.longitude),
    party: r.party,
    partisanScore: r.partisan_score != null ? Number(r.partisan_score) : null,
    turnoutScore: r.turnout_score != null ? Number(r.turnout_score) : null,
    label: [r.street, r.city, r.state, r.zip].filter(Boolean).join(', ') || `geo#${r.voter_geo_id}`,
    canvassStatus: r.canvass_status || null,
  }));
}

export class TurfRepo {
  static async list(organizationId: number): Promise<TurfRow[]> {
    const sql = await openSql();
    const [rows] = await sql.execute(
      `SELECT id, organization_id, label, definition, assigned_to, address_count,
              notes, created_by, created_at, updated_at
       FROM turfs WHERE organization_id = ? ORDER BY label ASC`,
      [organizationId]
    );
    return (rows as any[]).map(normalizeTurf);
  }

  /** G4: turfs assigned to a canvasser (MiniVAN pull surface). */
  static async listByAssignee(
    organizationId: number,
    assignedTo: number
  ): Promise<TurfRow[]> {
    const sql = await openSql();
    const [rows] = await sql.execute(
      `SELECT id, organization_id, label, definition, assigned_to, address_count,
              notes, created_by, created_at, updated_at
       FROM turfs
       WHERE organization_id = ? AND assigned_to = ?
       ORDER BY label ASC`,
      [organizationId, assignedTo]
    );
    return (rows as any[]).map(normalizeTurf);
  }

  static async getById(id: number, organizationId: number): Promise<TurfRow | null> {
    const sql = await openSql();
    const [rows] = await sql.execute(
      `SELECT id, organization_id, label, definition, assigned_to, address_count,
              notes, created_by, created_at, updated_at
       FROM turfs WHERE id = ? AND organization_id = ? LIMIT 1`,
      [id, organizationId]
    );
    const row = (rows as any[])[0];
    return row ? normalizeTurf(row) : null;
  }

  static async getByLabel(label: string, organizationId: number): Promise<TurfRow | null> {
    const sql = await openSql();
    const [rows] = await sql.execute(
      `SELECT id, organization_id, label, definition, assigned_to, address_count,
              notes, created_by, created_at, updated_at
       FROM turfs WHERE organization_id = ? AND label = ? LIMIT 1`,
      [organizationId, label]
    );
    const row = (rows as any[])[0];
    return row ? normalizeTurf(row) : null;
  }

  /**
   * Resolve eligibility, persist turf + materialized ordered walk-list.
   * Replaces prior snapshot when label already exists (upsert by label).
   */
  static async build(params: {
    organizationId: number;
    createdBy: number;
    label: string;
    definition: TurfDefinition;
    assignedTo?: number | null;
    notes?: string | null;
  }): Promise<{ turf: TurfRow; addresses: TurfAddress[] }> {
    const addresses = await queryTurfAddresses(params.organizationId, params.definition);
    const sql = await openSql();

    const existing = await this.getByLabel(params.label.trim(), params.organizationId);
    let turfId: number;

    if (existing) {
      turfId = existing.id;
      await sql.execute(
        `UPDATE turfs SET definition = ?, assigned_to = ?, address_count = ?, notes = ?,
           created_by = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND organization_id = ?`,
        [
          JSON.stringify(params.definition),
          params.assignedTo ?? existing.assigned_to,
          addresses.length,
          params.notes ?? existing.notes,
          params.createdBy,
          turfId,
          params.organizationId,
        ]
      );
      await sql.execute(`DELETE FROM turf_addresses WHERE turf_id = ?`, [turfId]);
    } else {
      const [result] = await sql.execute<ResultSetHeader>(
        `INSERT INTO turfs
          (organization_id, label, definition, assigned_to, address_count, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          params.organizationId,
          params.label.trim(),
          JSON.stringify(params.definition),
          params.assignedTo ?? null,
          addresses.length,
          params.notes ?? null,
          params.createdBy,
        ]
      );
      turfId = Number(result.insertId);
    }

    if (addresses.length) {
      const values: unknown[] = [];
      const placeholders: string[] = [];
      addresses.forEach((a, i) => {
        placeholders.push('(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        values.push(
          turfId,
          i + 1,
          a.voterGeoId,
          a.voterFileId,
          a.personRecordId,
          a.street,
          a.city,
          a.state,
          a.zip,
          a.latitude,
          a.longitude,
          a.party,
          a.label
        );
      });
      await sql.execute(
        `INSERT INTO turf_addresses
          (turf_id, sort_order, voter_geo_id, voter_file_id, person_record_id,
           street, city, state, zip, latitude, longitude, party, label)
         VALUES ${placeholders.join(',')}`,
        values
      );
    }

    const turf = await this.getById(turfId, params.organizationId);
    if (!turf) throw new Error('Failed to load built turf');
    return { turf, addresses };
  }

  static async listAddresses(
    turfId: number,
    organizationId: number,
    opts?: { limit?: number; offset?: number }
  ): Promise<{ turf: TurfRow; addresses: TurfAddress[] }> {
    const turf = await this.getById(turfId, organizationId);
    if (!turf) throw new Error('Turf not found');
    const sql = await openSql();
    const limit = Math.min(Math.max(opts?.limit || 5000, 1), 20000);
    const offset = Math.max(opts?.offset || 0, 0);
    const [rows] = await sql.execute(
      `SELECT ta.sort_order, ta.voter_geo_id, ta.voter_file_id, ta.person_record_id,
              ta.street, ta.city, ta.state, ta.zip, ta.latitude, ta.longitude, ta.party, ta.label,
              o.status AS field_status, o.party AS field_party, o.notes AS field_notes,
              pr.canvass_status AS person_canvass_status
       FROM turf_addresses ta
       LEFT JOIN turf_stop_outcomes o
         ON o.turf_id = ta.turf_id AND o.voter_geo_id = ta.voter_geo_id
       LEFT JOIN person_records pr ON pr.id = ta.person_record_id
       WHERE ta.turf_id = ?
       ORDER BY ta.sort_order ASC
       LIMIT ${limit} OFFSET ${offset}`,
      [turfId]
    );
    const addresses: TurfAddress[] = (rows as any[]).map((r) => ({
      voterGeoId: Number(r.voter_geo_id),
      voterFileId: r.voter_file_id,
      personRecordId: r.person_record_id != null ? Number(r.person_record_id) : null,
      street: r.street,
      city: r.city,
      state: r.state,
      zip: r.zip,
      latitude: Number(r.latitude),
      longitude: Number(r.longitude),
      party: r.field_party || r.party,
      partisanScore: null,
      turnoutScore: null,
      label: r.label || [r.street, r.city, r.state, r.zip].filter(Boolean).join(', '),
      canvassStatus:
        r.field_status || r.person_canvass_status || 'not_contacted',
      sortOrder: r.sort_order != null ? Number(r.sort_order) : null,
      fieldParty: r.field_party || null,
      fieldNotes: r.field_notes || null,
    }));
    return { turf, addresses };
  }

  static async assign(
    id: number,
    organizationId: number,
    assignedTo: number | null
  ): Promise<TurfRow | null> {
    const sql = await openSql();
    await sql.execute(
      `UPDATE turfs SET assigned_to = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND organization_id = ?`,
      [assignedTo, id, organizationId]
    );
    return this.getById(id, organizationId);
  }

  /** Rename a turf (label must be unique within the org). */
  static async rename(
    id: number,
    organizationId: number,
    label: string
  ): Promise<TurfRow | null> {
    const trimmed = String(label || '').trim();
    if (!trimmed) throw new Error('label is required');
    const clash = await this.getByLabel(trimmed, organizationId);
    if (clash && clash.id !== id) {
      throw new Error(`A turf named “${trimmed}” already exists`);
    }
    const sql = await openSql();
    const [result] = await sql.execute<ResultSetHeader>(
      `UPDATE turfs SET label = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND organization_id = ?`,
      [trimmed, id, organizationId]
    );
    if (!result.affectedRows) return null;
    return this.getById(id, organizationId);
  }

  /**
   * Contacted-door counts per turf (for Assignments coverage %).
   * Counts turf_stop_outcomes whose status is not not_contacted.
   */
  static async coverageCounts(
    organizationId: number
  ): Promise<Map<number, number>> {
    const sql = await openSql();
    const [rows] = await sql.execute(
      `SELECT o.turf_id AS turf_id, COUNT(*) AS contacted
       FROM turf_stop_outcomes o
       INNER JOIN turfs t ON t.id = o.turf_id
       WHERE t.organization_id = ?
         AND o.status IS NOT NULL
         AND o.status <> 'not_contacted'
       GROUP BY o.turf_id`,
      [organizationId]
    );
    const map = new Map<number, number>();
    for (const r of rows as any[]) {
      map.set(Number(r.turf_id), Number(r.contacted) || 0);
    }
    return map;
  }

  /**
   * MiniVAN M4 — live progress snapshot for Ground Game managers.
   * Coverage, outcome breakdown, last sync timestamps (walk token + contacts).
   */
  static async liveProgress(organizationId: number): Promise<{
    asOf: string;
    maxContactId: number;
    turfs: Array<{
      turfId: number;
      label: string;
      addressCount: number;
      assignedTo: number | null;
      contactedCount: number;
      coveragePct: number;
      outcomes: Record<string, number>;
      lastOutcomeAt: string | null;
      lastContactAt: string | null;
      lastTokenSyncAt: string | null;
      lastSyncedAt: string | null;
      canvasserLastSyncedAt: string | null;
    }>;
  }> {
    const sql = await openSql();
    const turfs = await this.list(organizationId);

    const [outcomeRows] = await sql.execute(
      `SELECT o.turf_id, o.status, COUNT(*) AS cnt, MAX(o.recorded_at) AS last_at
       FROM turf_stop_outcomes o
       INNER JOIN turfs t ON t.id = o.turf_id
       WHERE t.organization_id = ?
         AND o.status IS NOT NULL
         AND o.status <> 'not_contacted'
       GROUP BY o.turf_id, o.status`,
      [organizationId]
    );

    const [contactAgg] = await sql.execute(
      `SELECT turf_id, MAX(recorded_at) AS last_at, MAX(id) AS max_id
       FROM canvass_contacts
       WHERE organization_id = ? AND turf_id IS NOT NULL
       GROUP BY turf_id`,
      [organizationId]
    );

    const [tokenAgg] = await sql.execute(
      `SELECT turf_id, canvasser_user_id, MAX(last_used_at) AS last_at
       FROM walk_tokens
       WHERE organization_id = ?
         AND revoked_at IS NULL
         AND last_used_at IS NOT NULL
       GROUP BY turf_id, canvasser_user_id`,
      [organizationId]
    );

    const outcomesByTurf = new Map<number, Record<string, number>>();
    const lastOutcomeByTurf = new Map<number, Date>();
    for (const r of outcomeRows as any[]) {
      const tid = Number(r.turf_id);
      const status = String(r.status || 'unknown');
      const bag = outcomesByTurf.get(tid) || {};
      bag[status] = (bag[status] || 0) + (Number(r.cnt) || 0);
      outcomesByTurf.set(tid, bag);
      const last = r.last_at ? new Date(r.last_at) : null;
      if (last && !Number.isNaN(last.getTime())) {
        const prev = lastOutcomeByTurf.get(tid);
        if (!prev || last > prev) lastOutcomeByTurf.set(tid, last);
      }
    }

    const lastContactByTurf = new Map<number, Date>();
    let maxContactId = 0;
    for (const r of contactAgg as any[]) {
      const tid = Number(r.turf_id);
      const last = r.last_at ? new Date(r.last_at) : null;
      if (last && !Number.isNaN(last.getTime())) {
        lastContactByTurf.set(tid, last);
      }
      const mid = Number(r.max_id) || 0;
      if (mid > maxContactId) maxContactId = mid;
    }

    const lastTokenByTurf = new Map<number, Date>();
    const lastTokenByCanvasserTurf = new Map<string, Date>();
    for (const r of tokenAgg as any[]) {
      const tid = Number(r.turf_id);
      const uid = Number(r.canvasser_user_id);
      const last = r.last_at ? new Date(r.last_at) : null;
      if (!last || Number.isNaN(last.getTime())) continue;
      const prev = lastTokenByTurf.get(tid);
      if (!prev || last > prev) lastTokenByTurf.set(tid, last);
      lastTokenByCanvasserTurf.set(`${tid}:${uid}`, last);
    }

    const toIso = (d: Date | null | undefined) =>
      d && !Number.isNaN(d.getTime()) ? d.toISOString() : null;

    const latest = (...dates: Array<Date | null | undefined>) => {
      let best: Date | null = null;
      for (const d of dates) {
        if (!d || Number.isNaN(d.getTime())) continue;
        if (!best || d > best) best = d;
      }
      return best;
    };

    return {
      asOf: new Date().toISOString(),
      maxContactId,
      turfs: turfs.map((t) => {
        const outcomes = outcomesByTurf.get(t.id) || {};
        const contactedCount = Object.values(outcomes).reduce(
          (s, n) => s + n,
          0
        );
        const addressCount = Number(t.address_count) || 0;
        const coveragePct = addressCount
          ? Math.min(100, Math.round((contactedCount / addressCount) * 100))
          : 0;
        const lastOutcome = lastOutcomeByTurf.get(t.id) || null;
        const lastContact = lastContactByTurf.get(t.id) || null;
        const lastToken = lastTokenByTurf.get(t.id) || null;
        const canvasserSync =
          t.assigned_to != null
            ? lastTokenByCanvasserTurf.get(`${t.id}:${t.assigned_to}`) || null
            : null;
        const lastSynced = latest(lastOutcome, lastContact, lastToken);
        return {
          turfId: t.id,
          label: t.label,
          addressCount,
          assignedTo: t.assigned_to,
          contactedCount,
          coveragePct,
          outcomes,
          lastOutcomeAt: toIso(lastOutcome),
          lastContactAt: toIso(lastContact),
          lastTokenSyncAt: toIso(lastToken),
          lastSyncedAt: toIso(lastSynced),
          canvasserLastSyncedAt: toIso(canvasserSync || lastSynced),
        };
      }),
    };
  }

  /**
   * G3 — record a door outcome:
   * 1) append-only canvass_contacts (full trail)
   * 2) upsert turf_stop_outcomes (current-status rollup)
   * 3) dnc_request/refused → contact_suppression
   * 4) situation snapshot write-back (campaign signal)
   */
  static async recordStop(params: {
    organizationId: number;
    turfId: number;
    voterGeoId: number;
    recordedBy: number;
    status: TurfStopStatus;
    party?: string | null;
    notes?: string | null;
    surveyResponseId?: number | null;
    /** G4 offline: client-supplied door time (ISO). Defaults to server now. */
    recordedAt?: string | Date | null;
    /** G4 offline: idempotent retry key (unique per org). */
    clientEventId?: string | null;
  }): Promise<{ outcome: TurfStopOutcome; address: TurfAddress | null; contactId: number }> {
    const turf = await this.getById(params.turfId, params.organizationId);
    if (!turf) throw new Error('Turf not found');

    const sql = await openSql();
    const [addrRows] = await sql.execute(
      `SELECT voter_geo_id, person_record_id, voter_file_id FROM turf_addresses
       WHERE turf_id = ? AND voter_geo_id = ? LIMIT 1`,
      [params.turfId, params.voterGeoId]
    );
    const addr = (addrRows as any[])[0];
    if (!addr) throw new Error('Stop not on this turf');

    const personRecordId =
      addr.person_record_id != null ? Number(addr.person_record_id) : null;
    const voterFileId = addr.voter_file_id ? String(addr.voter_file_id) : null;
    const clientEventId = params.clientEventId
      ? String(params.clientEventId).trim().slice(0, 64)
      : null;
    const recordedAt = params.recordedAt ? new Date(params.recordedAt) : new Date();
    if (Number.isNaN(recordedAt.getTime())) {
      throw new Error('recordedAt must be a valid datetime');
    }

    // Idempotent offline retry: return existing contact if client_event_id already landed
    if (clientEventId) {
      const [existing] = await sql.execute(
        `SELECT id FROM canvass_contacts
         WHERE organization_id = ? AND client_event_id = ? LIMIT 1`,
        [params.organizationId, clientEventId]
      );
      const prior = (existing as any[])[0];
      if (prior) {
        const [outRows] = await sql.execute(
          `SELECT id, organization_id, turf_id, voter_geo_id, person_record_id,
                  status, party, notes, recorded_by, recorded_at
           FROM turf_stop_outcomes
           WHERE turf_id = ? AND voter_geo_id = ? LIMIT 1`,
          [params.turfId, params.voterGeoId]
        );
        const o = (outRows as any[])[0];
        const listed = await this.listAddresses(params.turfId, params.organizationId, {
          limit: 20000,
        });
        const address =
          listed.addresses.find((a) => a.voterGeoId === params.voterGeoId) || null;
        if (!o) {
          return {
            contactId: Number(prior.id),
            outcome: {
              id: 0,
              organization_id: params.organizationId,
              turf_id: params.turfId,
              voter_geo_id: params.voterGeoId,
              person_record_id: personRecordId,
              status: params.status,
              party: params.party ?? null,
              notes: params.notes ?? null,
              recorded_by: params.recordedBy,
              recorded_at: recordedAt,
            },
            address,
          };
        }
        return {
          contactId: Number(prior.id),
          outcome: {
            id: Number(o.id),
            organization_id: Number(o.organization_id),
            turf_id: Number(o.turf_id),
            voter_geo_id: Number(o.voter_geo_id),
            person_record_id: o.person_record_id != null ? Number(o.person_record_id) : null,
            status: o.status,
            party: o.party,
            notes: o.notes,
            recorded_by: Number(o.recorded_by),
            recorded_at: o.recorded_at,
          },
          address,
        };
      }
    }

    // G3.1 — append-only contact log (never UPDATE)
    const [contactResult] = await sql.execute<ResultSetHeader>(
      `INSERT INTO canvass_contacts
        (organization_id, voter_geo_id, person_record_id, voter_file_id, turf_id,
         canvasser_id, status, note, party, survey_response_id, client_event_id, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        params.organizationId,
        params.voterGeoId,
        personRecordId,
        voterFileId,
        params.turfId,
        params.recordedBy,
        params.status,
        params.notes ?? null,
        params.party ?? null,
        params.surveyResponseId ?? null,
        clientEventId,
        recordedAt,
      ]
    );
    const contactId = Number(contactResult.insertId);

    // G3.2 — current-status rollup (latest contact wins)
    await sql.execute(
      `INSERT INTO turf_stop_outcomes
        (organization_id, turf_id, voter_geo_id, person_record_id, status, party, notes, recorded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         status = VALUES(status),
         party = VALUES(party),
         notes = VALUES(notes),
         person_record_id = COALESCE(VALUES(person_record_id), person_record_id),
         recorded_by = VALUES(recorded_by),
         recorded_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP`,
      [
        params.organizationId,
        params.turfId,
        params.voterGeoId,
        personRecordId,
        params.status,
        params.party ?? null,
        params.notes ?? null,
        params.recordedBy,
      ]
    );

    // Mirror to household person_records when linked (D3 door confirm)
    if (personRecordId) {
      try {
        const { PersonRepo } = await import('@/app/utils/database/person-repo');
        await PersonRepo.confirmInPerson({
          id: personRecordId,
          organizationId: params.organizationId,
          userId: params.recordedBy,
          status: params.status,
          party: params.party ?? null,
          notes: params.notes ?? null,
          applyPartyToRecord: true,
        });
      } catch (e) {
        console.warn('[turf recordStop] person mirror failed', e);
      }
    }

    // G3.3 — dnc_request (and refused) auto-write contact_suppression
    let suppressed = false;
    if (DNC_STATUSES.has(params.status)) {
      try {
        await ContactSuppressionRepo.add({
          organizationId: params.organizationId,
          voterGeoId: params.voterGeoId,
          personRecordId,
          voterFileId,
          reason:
            params.status === 'dnc_request' ? 'dnc_request_at_door' : 'refused_at_door',
          source: 'refused',
          notes: params.notes ?? null,
          createdBy: params.recordedBy,
        });
        suppressed = true;
      } catch {
        /* may already exist */
      }
    }

    // G3.3 — feed situation snapshot (fire-and-forget; never blocks the door log)
    void import('@/app/utils/services/situation-writeback-service')
      .then(({ commitCanvassOutcomeToSituation }) =>
        commitCanvassOutcomeToSituation({
          orgId: params.organizationId,
          turfId: params.turfId,
          turfLabel: turf.label,
          voterGeoId: params.voterGeoId,
          status: params.status,
          party: params.party ?? null,
          note: params.notes ?? null,
          canvasserId: params.recordedBy,
          suppressed,
        })
      )
      .catch((e) => console.warn('[turf recordStop] situation write-back failed', e));

    const [outRows] = await sql.execute(
      `SELECT id, organization_id, turf_id, voter_geo_id, person_record_id,
              status, party, notes, recorded_by, recorded_at
       FROM turf_stop_outcomes
       WHERE turf_id = ? AND voter_geo_id = ? LIMIT 1`,
      [params.turfId, params.voterGeoId]
    );
    const o = (outRows as any[])[0];
    const outcome: TurfStopOutcome = {
      id: Number(o.id),
      organization_id: Number(o.organization_id),
      turf_id: Number(o.turf_id),
      voter_geo_id: Number(o.voter_geo_id),
      person_record_id: o.person_record_id != null ? Number(o.person_record_id) : null,
      status: o.status,
      party: o.party,
      notes: o.notes,
      recorded_by: Number(o.recorded_by),
      recorded_at: o.recorded_at,
    };

    const listed = await this.listAddresses(params.turfId, params.organizationId, {
      limit: 20000,
    });
    const address =
      listed.addresses.find((a) => a.voterGeoId === params.voterGeoId) || null;

    return { outcome, address, contactId };
  }

  static async delete(id: number, organizationId: number): Promise<boolean> {
    const sql = await openSql();
    const [result] = await sql.execute<ResultSetHeader>(
      `DELETE FROM turfs WHERE id = ? AND organization_id = ?`,
      [id, organizationId]
    );
    return result.affectedRows > 0;
  }
}

function normalizeTurf(row: any): TurfRow {
  let definition: TurfDefinition = {};
  if (row.definition) {
    try {
      definition =
        typeof row.definition === 'string' ? JSON.parse(row.definition) : row.definition;
    } catch {
      definition = {};
    }
  }
  return {
    id: Number(row.id),
    organization_id: Number(row.organization_id),
    label: row.label,
    definition,
    assigned_to: row.assigned_to != null ? Number(row.assigned_to) : null,
    address_count: Number(row.address_count) || 0,
    notes: row.notes,
    created_by: Number(row.created_by),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
