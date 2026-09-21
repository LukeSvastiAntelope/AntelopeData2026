/**
 * MT1 — Segments from tracked attributes.
 *
 * A segment is a named live filter over D2 map/collation attributes +
 * VT2/VT3 tracked attributes / change-state. Membership is recomputed on
 * every resolve — never a frozen voter list, never a persuasion score.
 * Microtargeting (#3) uses this to decide *what to say*; the propensity
 * quarantine still decides *who/when* to reach.
 */

import { openSql } from '@/app/utils/database/db';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import {
  queryVoters,
  type VoterQueryFilters,
  type VoterQueryHit,
  type VoterQueryResult,
} from '@/app/utils/services/voter-query';
import {
  getPresetById,
  VOTER_SEGMENT_PRESETS,
  type VoterSegmentDefinition,
  type VoterSegmentPreset,
} from '@/app/utils/voter-segment-presets';

export type { VoterSegmentDefinition };

export type ResolvedVoterSegment = {
  id: string;
  name: string;
  description: string | null;
  source: 'preset' | 'saved';
  definition: VoterSegmentDefinition;
  /** Live membership — recomputed */
  count: number;
  candidateCount: number;
  people: VoterQueryHit[];
  disclaimer: string;
};

export type SavedVoterSegmentRow = {
  id: number;
  organization_id: number;
  slug: string;
  name: string;
  description: string | null;
  definition: VoterSegmentDefinition;
  created_by: number | null;
  created_at: Date | string;
  updated_at: Date | string;
};

const DISCLAIMER =
  'Segment from observed map + survey-stated attributes — message-tailoring input only. Not a targeting/persuasion score; propensity quarantine still owns who/when.';

let tableReady: Promise<void> | null = null;

async function ensureSegmentsTable(): Promise<void> {
  if (!tableReady) {
    tableReady = (async () => {
      const db = await openSql();
      await db.execute(`
        CREATE TABLE IF NOT EXISTS voter_segments (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
          organization_id INT NOT NULL,
          slug VARCHAR(96) NOT NULL,
          name VARCHAR(255) NOT NULL,
          description TEXT NULL,
          definition JSON NOT NULL,
          created_by INT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uq_voter_segment_org_slug (organization_id, slug),
          KEY idx_voter_segment_org (organization_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    })();
  }
  await tableReady;
}

function slugify(raw: string): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function parseDefinition(raw: unknown): VoterSegmentDefinition {
  if (!raw) return {};
  const obj =
    typeof raw === 'string'
      ? (() => {
          try {
            return JSON.parse(raw);
          } catch {
            return {};
          }
        })()
      : (raw as Record<string, unknown>);
  return obj as VoterSegmentDefinition;
}

/**
 * Map a cohort-style preset (legacy filter rules) onto a live person/tracked definition
 * when possible. Tracked presets carry `definition` directly.
 */
export function definitionFromPreset(
  preset: VoterSegmentPreset
): VoterSegmentDefinition {
  // Prefer explicit live definition (MT1 tracked presets)
  if (preset.definition && Object.keys(preset.definition).length) {
    return { ...preset.definition };
  }

  const def: VoterSegmentDefinition = {};
  for (const f of preset.filters || []) {
    const field = f.field;
    const value = f.value;
    if (field === 'gender') {
      def.gender = value.split(',').map((s) => s.trim()).filter(Boolean);
    } else if (field === 'age') {
      const parts = value.split(',').map((s) => s.trim()).filter(Boolean);
      def.ageBucket = parts;
      // "35+" shorthand via gen-x style buckets
      if (parts.every((p) => /^(35-44|45-54|55-64|65\+)$/.test(p))) {
        def.minAgeYears = 35;
      }
    } else if (field === 'party_affiliation') {
      def.party = value.split(',').map((s) => s.trim()).filter(Boolean);
    } else if (field === 'owner_occupied' || field === 'homeowner') {
      def.ownerOccupied =
        value === '1' || /^true|yes|owner/i.test(value) ? true : false;
    }
  }
  return def;
}

/** Presets that resolve via person_records + tracked attrs (not turf geo scores). */
export function isTrackedAttributePreset(presetId: string): boolean {
  const p = getPresetById(presetId);
  if (!p) return false;
  if (p.definition?.tracked?.length || p.definition?.hasDonated) return true;
  if (p.category === 'tracked') return true;
  // Demographic presets with gender/age that map to person_records
  const def = definitionFromPreset(p);
  return !!(
    def.gender?.length ||
    def.minAgeYears != null ||
    def.ageBucket?.length ||
    def.ownerOccupied != null ||
    def.tracked?.length ||
    def.hasDonated
  );
}

export function definitionToQueryFilters(
  definition: VoterSegmentDefinition,
  organizationId: number
): VoterQueryFilters {
  return {
    organizationId,
    gender: definition.gender,
    minAgeYears: definition.minAgeYears,
    maxAgeYears: definition.maxAgeYears,
    ageBucket: definition.ageBucket,
    party: definition.party,
    ownerOccupied: definition.ownerOccupied,
    zip: definition.zip,
    district: definition.district,
    voterStatus: definition.voterStatus,
    canvassStatus: definition.canvassStatus,
    tracked: definition.tracked,
    hasDonated: definition.hasDonated,
    excludeSuppressed: definition.excludeSuppressed,
    requireCoordinates: definition.requireCoordinates !== false,
    includeFenceLabels: definition.includeFenceLabels,
    excludeFenceLabels: definition.excludeFenceLabels,
    candidateLimit: definition.limit || 5000,
    includeState: true,
  };
}

export async function listSavedSegments(
  organizationId: number
): Promise<SavedVoterSegmentRow[]> {
  await ensureSegmentsTable();
  const db = await openSql();
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT * FROM voter_segments WHERE organization_id = ? ORDER BY updated_at DESC`,
    [organizationId]
  );
  return rows.map((r) => ({
    id: Number(r.id),
    organization_id: Number(r.organization_id),
    slug: String(r.slug),
    name: String(r.name),
    description: r.description != null ? String(r.description) : null,
    definition: parseDefinition(r.definition),
    created_by: r.created_by != null ? Number(r.created_by) : null,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));
}

export async function getSavedSegment(
  organizationId: number,
  idOrSlug: string | number
): Promise<SavedVoterSegmentRow | null> {
  await ensureSegmentsTable();
  const db = await openSql();
  const asNum = Number(idOrSlug);
  const [rows] = await db.execute<RowDataPacket[]>(
    Number.isFinite(asNum) && String(asNum) === String(idOrSlug)
      ? `SELECT * FROM voter_segments WHERE organization_id = ? AND id = ? LIMIT 1`
      : `SELECT * FROM voter_segments WHERE organization_id = ? AND slug = ? LIMIT 1`,
    [
      organizationId,
      Number.isFinite(asNum) && String(asNum) === String(idOrSlug)
        ? asNum
        : String(idOrSlug),
    ]
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: Number(r.id),
    organization_id: Number(r.organization_id),
    slug: String(r.slug),
    name: String(r.name),
    description: r.description != null ? String(r.description) : null,
    definition: parseDefinition(r.definition),
    created_by: r.created_by != null ? Number(r.created_by) : null,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export async function saveVoterSegment(params: {
  organizationId: number;
  name: string;
  description?: string | null;
  definition: VoterSegmentDefinition;
  slug?: string;
  createdBy?: number | null;
}): Promise<SavedVoterSegmentRow> {
  await ensureSegmentsTable();
  const db = await openSql();
  const slug = slugify(params.slug || params.name) || `seg-${Date.now()}`;
  const [ins] = await db.execute<ResultSetHeader>(
    `INSERT INTO voter_segments
      (organization_id, slug, name, description, definition, created_by)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       name = VALUES(name),
       description = VALUES(description),
       definition = VALUES(definition),
       updated_at = CURRENT_TIMESTAMP`,
    [
      params.organizationId,
      slug,
      params.name.trim(),
      params.description ?? null,
      JSON.stringify(params.definition || {}),
      params.createdBy ?? null,
    ]
  );

  // ON DUPLICATE may not set insertId — reload by slug
  const saved = await getSavedSegment(params.organizationId, slug);
  if (!saved) {
    throw new Error(`failed to save segment (insertId=${ins.insertId})`);
  }
  return saved;
}

export async function deleteVoterSegment(
  organizationId: number,
  idOrSlug: string | number
): Promise<boolean> {
  await ensureSegmentsTable();
  const existing = await getSavedSegment(organizationId, idOrSlug);
  if (!existing) return false;
  const db = await openSql();
  const [res] = await db.execute<ResultSetHeader>(
    `DELETE FROM voter_segments WHERE organization_id = ? AND id = ?`,
    [organizationId, existing.id]
  );
  return res.affectedRows > 0;
}

/**
 * Resolve a preset id, saved segment id/slug, or raw definition to a live voter set.
 */
export async function resolveVoterSegment(params: {
  organizationId: number;
  segmentId?: string | null;
  definition?: VoterSegmentDefinition | null;
  limit?: number;
}): Promise<ResolvedVoterSegment> {
  const orgId = params.organizationId;
  let id = 'ad-hoc';
  let name = 'Ad-hoc segment';
  let description: string | null = null;
  let source: 'preset' | 'saved' = 'preset';
  let definition: VoterSegmentDefinition = { ...(params.definition || {}) };

  if (params.segmentId) {
    const preset = getPresetById(params.segmentId);
    if (preset) {
      id = preset.id;
      name = preset.name;
      description = preset.description;
      source = 'preset';
      definition = { ...definitionFromPreset(preset), ...definition };
    } else {
      const saved = await getSavedSegment(orgId, params.segmentId);
      if (saved) {
        id = saved.slug;
        name = saved.name;
        description = saved.description;
        source = 'saved';
        definition = { ...saved.definition, ...definition };
      } else {
        throw new Error(`Unknown segment: ${params.segmentId}`);
      }
    }
  }

  if (params.limit != null) {
    definition = { ...definition, limit: params.limit };
  }

  const result: VoterQueryResult = await queryVoters(
    definitionToQueryFilters(definition, orgId)
  );

  return {
    id,
    name,
    description,
    source,
    definition,
    count: result.count,
    candidateCount: result.candidateCount,
    people: result.people,
    disclaimer: DISCLAIMER,
  };
}

/** Catalog: built-in tracked/demographic presets + org saved segments. */
export async function listSegmentCatalog(organizationId: number): Promise<
  Array<{
    id: string;
    name: string;
    description: string | null;
    source: 'preset' | 'saved';
    category?: string;
    definition: VoterSegmentDefinition;
  }>
> {
  const presets = VOTER_SEGMENT_PRESETS.filter(
    (p) => p.category === 'tracked' || p.category === 'demographic' || p.definition
  ).map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    source: 'preset' as const,
    category: p.category,
    definition: definitionFromPreset(p),
  }));

  const saved = (await listSavedSegments(organizationId)).map((s) => ({
    id: s.slug,
    name: s.name,
    description: s.description,
    source: 'saved' as const,
    category: 'saved',
    definition: s.definition,
  }));

  return [...presets, ...saved];
}
