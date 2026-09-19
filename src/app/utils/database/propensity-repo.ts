/**
 * voter_propensity materialized view repo (P2 + P3 sales surface).
 * Refresh recomputes from Map prior + engagement events — never a frozen score.
 */

import { openSql } from '@/app/utils/database/db';
import { GeofenceRepo } from '@/app/utils/database/geo-repo';
import { computePropensityBlend } from '@/app/utils/propensity/blend';
import {
  eventsFromPersonCanvass,
  eventsFromTurfOutcome,
  type EngagementEvent,
} from '@/app/utils/propensity/evidence';
import type { PropensityTier } from '@/app/utils/propensity/config';
import {
  getDecayK,
  isConfirmedConfidence,
} from '@/app/utils/propensity/config';
import { sortWhoToWork } from '@/app/utils/propensity/sales';

export type VoterPropensityRow = {
  person_record_id: number;
  organization_id: number;
  p0: number;
  evidence_e: number;
  prior_weight: number;
  posterior_q: number | null;
  propensity: number;
  confidence: number;
  tier: PropensityTier;
  decay_k: number;
  formula_version: string;
  evidence_json: unknown;
  recomputed_at: Date;
  // joined
  label?: string;
  party?: string | null;
  district?: string | null;
  canvass_status?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  /** estimated | confirmed — derived from confidence for sales UI */
  signal?: 'estimated' | 'confirmed';
};

export type PropensityListOpts = {
  tier?: PropensityTier | PropensityTier[];
  party?: string[];
  /** Subtract contact_suppression */
  excludeSuppressed?: boolean;
  includeFenceIds?: number[];
  includeFenceLabels?: string[];
  excludeFenceIds?: number[];
  excludeFenceLabels?: string[];
  /** Open doors only — skip confirmed/refused/moved */
  openOnly?: boolean;
  limit?: number;
};

export class PropensityRepo {
  static async get(personRecordId: number): Promise<VoterPropensityRow | null> {
    const sql = await openSql();
    const [rows] = await sql.execute(
      `SELECT person_record_id, organization_id, p0, evidence_e, prior_weight, posterior_q,
              propensity, confidence, tier, decay_k, formula_version, evidence_json, recomputed_at
       FROM voter_propensity WHERE person_record_id = ? LIMIT 1`,
      [personRecordId]
    );
    const row = (rows as any[])[0];
    return row ? normalize(row) : null;
  }

  static async listByOrg(
    organizationId: number,
    opts?: PropensityListOpts
  ): Promise<VoterPropensityRow[]> {
    const sql = await openSql();
    const limit = Math.min(Math.max(opts?.limit || 500, 1), 5000);
    const params: unknown[] = [organizationId];
    const where: string[] = ['vp.organization_id = ?'];

    const tiers = normalizeTiers(opts?.tier);
    if (tiers.length) {
      where.push(`vp.tier IN (${tiers.map(() => '?').join(',')})`);
      params.push(...tiers);
    }
    if (opts?.party?.length) {
      where.push(
        `COALESCE(NULLIF(pr.canvass_party,''), pr.party) IN (${opts.party.map(() => '?').join(',')})`
      );
      params.push(...opts.party);
    }
    if (opts?.openOnly) {
      where.push(
        `COALESCE(pr.canvass_status, 'not_contacted') NOT IN ('confirmed','refused','moved','wrong_address')`
      );
    }
    if (opts?.excludeSuppressed) {
      where.push(
        `NOT EXISTS (
           SELECT 1 FROM contact_suppression cs
           WHERE cs.organization_id = vp.organization_id
             AND cs.person_record_id = pr.id
         )`
      );
    }

    const includeIds = await resolveFenceIds(
      organizationId,
      opts?.includeFenceIds,
      opts?.includeFenceLabels
    );
    const excludeIds = await resolveFenceIds(
      organizationId,
      opts?.excludeFenceIds,
      opts?.excludeFenceLabels
    );

    if (includeIds.length) {
      where.push(
        `EXISTS (
           SELECT 1 FROM geofences fi
           WHERE fi.organization_id = ?
             AND fi.id IN (${includeIds.map(() => '?').join(',')})
             AND ${personFenceContainsSql('fi')}
         )`
      );
      params.push(organizationId, ...includeIds);
    }
    if (excludeIds.length) {
      where.push(
        `NOT EXISTS (
           SELECT 1 FROM geofences fe
           WHERE fe.organization_id = ?
             AND fe.id IN (${excludeIds.map(() => '?').join(',')})
             AND ${personFenceContainsSql('fe')}
         )`
      );
      params.push(organizationId, ...excludeIds);
    }

    const [rows] = await sql.execute(
      `SELECT vp.person_record_id, vp.organization_id, vp.p0, vp.evidence_e, vp.prior_weight,
              vp.posterior_q, vp.propensity, vp.confidence, vp.tier, vp.decay_k,
              vp.formula_version, vp.evidence_json, vp.recomputed_at,
              CONCAT_WS(' ', pr.first_name, pr.last_name) AS label,
              COALESCE(NULLIF(pr.canvass_party,''), pr.party) AS party,
              pr.district,
              pr.canvass_status,
              pr.latitude,
              pr.longitude
       FROM voter_propensity vp
       JOIN person_records pr ON pr.id = vp.person_record_id
       WHERE ${where.join(' AND ')}
       ORDER BY vp.propensity DESC, vp.person_record_id ASC
       LIMIT ${limit}`,
      params
    );
    return (rows as any[]).map(normalize);
  }

  /**
   * P3 "Who to work next" — hot → warm → cold, then fresher evidence,
   * deprioritizing already-confirmed/refused doors.
   */
  static async whoToWorkNext(
    organizationId: number,
    opts?: PropensityListOpts
  ): Promise<VoterPropensityRow[]> {
    const rows = await this.listByOrg(organizationId, {
      ...opts,
      openOnly: opts?.openOnly !== false,
      excludeSuppressed: opts?.excludeSuppressed !== false,
      limit: opts?.limit || 50,
    });
    const now = Date.now();
    return sortWhoToWork(
      rows.map((r) => ({
        ...r,
        freshnessMs: r.recomputed_at ? new Date(r.recomputed_at).getTime() : 0,
        canvassStatus: r.canvass_status,
      })),
      now
    );
  }

  static async funnelSummary(organizationId: number): Promise<{
    hot: number;
    warm: number;
    cold: number;
    total: number;
    avgPropensity: number | null;
    avgConfidence: number | null;
    decayK: number;
    estimated: number;
    confirmed: number;
  }> {
    const sql = await openSql();
    const [rows] = await sql.execute(
      `SELECT
         SUM(tier = 'hot') AS hot,
         SUM(tier = 'warm') AS warm,
         SUM(tier = 'cold') AS cold,
         COUNT(*) AS total,
         AVG(propensity) AS avg_propensity,
         AVG(confidence) AS avg_confidence,
         SUM(confidence >= 0.55) AS confirmed,
         SUM(confidence < 0.55) AS estimated
       FROM voter_propensity WHERE organization_id = ?`,
      [organizationId]
    );
    const r = (rows as any[])[0] || {};
    return {
      hot: Number(r.hot) || 0,
      warm: Number(r.warm) || 0,
      cold: Number(r.cold) || 0,
      total: Number(r.total) || 0,
      avgPropensity: r.avg_propensity != null ? Number(r.avg_propensity) : null,
      avgConfidence: r.avg_confidence != null ? Number(r.avg_confidence) : null,
      decayK: getDecayK(),
      estimated: Number(r.estimated) || 0,
      confirmed: Number(r.confirmed) || 0,
    };
  }

  /** Recompute one person from live events + Map prior. */
  static async refreshPerson(
    personRecordId: number,
    organizationId: number
  ): Promise<VoterPropensityRow | null> {
    const sql = await openSql();
    const [people] = await sql.execute(
      `SELECT id, organization_id, party, canvass_party, voter_status, district, zip, state,
              canvass_status, canvass_confirmed_at
       FROM person_records
       WHERE id = ? AND organization_id <=> ?
       LIMIT 1`,
      [personRecordId, organizationId]
    );
    const person = (people as any[])[0];
    if (!person) return null;

    const events: EngagementEvent[] = [...eventsFromPersonCanvass(person)];

    const [turfRows] = await sql.execute(
      `SELECT status, party, recorded_at FROM turf_stop_outcomes
       WHERE person_record_id = ? AND organization_id = ?
       ORDER BY recorded_at DESC LIMIT 20`,
      [personRecordId, organizationId]
    );
    for (const t of turfRows as any[]) {
      events.push(...eventsFromTurfOutcome(t));
    }

    const blend = computePropensityBlend(
      {
        party: person.party,
        canvassParty: person.canvass_party,
        voterStatus: person.voter_status,
        district: person.district,
        zip: person.zip,
        state: person.state,
      },
      events
    );

    await sql.execute(
      `INSERT INTO voter_propensity
        (person_record_id, organization_id, p0, evidence_e, prior_weight, posterior_q,
         propensity, confidence, tier, decay_k, formula_version, evidence_json, recomputed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON DUPLICATE KEY UPDATE
         p0 = VALUES(p0),
         evidence_e = VALUES(evidence_e),
         prior_weight = VALUES(prior_weight),
         posterior_q = VALUES(posterior_q),
         propensity = VALUES(propensity),
         confidence = VALUES(confidence),
         tier = VALUES(tier),
         decay_k = VALUES(decay_k),
         formula_version = VALUES(formula_version),
         evidence_json = VALUES(evidence_json),
         recomputed_at = CURRENT_TIMESTAMP`,
      [
        personRecordId,
        organizationId,
        blend.p0,
        blend.evidenceE,
        blend.priorWeight,
        blend.posteriorQ,
        blend.propensity,
        blend.confidence,
        blend.tier,
        blend.decayK,
        blend.formulaVersion,
        JSON.stringify({
          events: blend.evidenceDetail,
          provenance: blend.prior.provenance,
          materialized: true,
          note: 'Recomputed view — not a frozen ballistic score',
        }),
      ]
    );

    return this.get(personRecordId);
  }

  /** Refresh all geocoded persons for an org (cadence / manual). */
  static async refreshOrganization(
    organizationId: number,
    opts?: { limit?: number }
  ): Promise<{ refreshed: number }> {
    const sql = await openSql();
    const limit = Math.min(Math.max(opts?.limit || 2000, 1), 10000);
    const [rows] = await sql.execute(
      `SELECT id FROM person_records
       WHERE organization_id = ? AND latitude IS NOT NULL
       ORDER BY id ASC
       LIMIT ${limit}`,
      [organizationId]
    );
    let refreshed = 0;
    for (const r of rows as any[]) {
      await this.refreshPerson(Number(r.id), organizationId);
      refreshed++;
    }
    return { refreshed };
  }
}

function normalizeTiers(
  tier: PropensityTier | PropensityTier[] | undefined
): PropensityTier[] {
  if (!tier) return [];
  return Array.isArray(tier) ? tier : [tier];
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

/** person_records lat/lng → MySQL SRID 4326 point (lat lng axis order). */
function personFenceContainsSql(alias: string): string {
  return `(
    (
      ${alias}.fence_type = 'polygon'
      AND ST_Contains(
        ${alias}.geom,
        ST_GeomFromText(CONCAT('POINT(', pr.latitude, ' ', pr.longitude, ')'), 4326)
      )
    )
    OR (
      ${alias}.fence_type = 'circle'
      AND ${alias}.radius_m IS NOT NULL
      AND ST_Distance_Sphere(
        ST_GeomFromText(CONCAT('POINT(', pr.latitude, ' ', pr.longitude, ')'), 4326),
        ${alias}.geom
      ) <= ${alias}.radius_m
    )
  )`;
}

function normalize(row: any): VoterPropensityRow {
  let evidence_json: unknown = row.evidence_json;
  if (typeof evidence_json === 'string') {
    try {
      evidence_json = JSON.parse(evidence_json);
    } catch {
      /* keep string */
    }
  }
  const confidence = Number(row.confidence);
  return {
    person_record_id: Number(row.person_record_id),
    organization_id: Number(row.organization_id),
    p0: Number(row.p0),
    evidence_e: Number(row.evidence_e),
    prior_weight: Number(row.prior_weight),
    posterior_q: row.posterior_q != null ? Number(row.posterior_q) : null,
    propensity: Number(row.propensity),
    confidence,
    tier: row.tier,
    decay_k: Number(row.decay_k),
    formula_version: row.formula_version,
    evidence_json,
    recomputed_at: row.recomputed_at,
    label: row.label,
    party: row.party,
    district: row.district,
    canvass_status: row.canvass_status ?? null,
    latitude: row.latitude != null ? Number(row.latitude) : null,
    longitude: row.longitude != null ? Number(row.longitude) : null,
    signal: isConfirmedConfidence(confidence) ? 'confirmed' : 'estimated',
  };
}
